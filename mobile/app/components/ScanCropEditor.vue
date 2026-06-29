<script setup lang="ts">
/**
 * ScanCropEditor — logique OpenCV.js inchangée.
 * Seuls les styles UI ont été migrés vers le design system dark.
 */

interface Props {
  imageBase64: string
  mimeType: 'image/jpeg' | 'image/png'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'confirm', result: string): void
  (e: 'cancel'): void
}>()

const canvasEl       = ref<HTMLCanvasElement | null>(null)
const hiddenCanvasEl = ref<HTMLCanvasElement | null>(null)
const containerEl    = ref<HTMLDivElement | null>(null)

const isLoadingCv  = ref(true)
const cvError      = ref<string | null>(null)
const isProcessing = ref(false)

const corners = ref<[number, number][]>([
  [0.05, 0.05],
  [0.95, 0.05],
  [0.95, 0.95],
  [0.05, 0.95],
])

const dragIndex   = ref(-1)
const imgNaturalW = ref(0)
const imgNaturalH = ref(0)
const displayW    = ref(0)
const displayH    = ref(0)

let cv: any = null

async function _loadOpenCv(): Promise<void> {
  if ((window as any).cv?.Mat) { cv = (window as any).cv; return }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OpenCV timeout après 30s')), 30_000)
    function waitForCv(attempts = 0): void {
      const wcv = (window as any).cv
      if (wcv?.Mat) { cv = wcv; clearTimeout(timeout); resolve(); return }
      if (attempts > 300) return
      setTimeout(() => waitForCv(attempts + 1), 100)
    }
    const prevInit = (window as any).Module?.onRuntimeInitialized;
    (window as any).Module = {
      ...(window as any).Module,
      onRuntimeInitialized() { prevInit?.(); waitForCv() },
    }
    if (!document.querySelector('script[data-opencv]')) {
      const script = document.createElement('script')
      script.src = '/opencv.js'; script.async = true; script.dataset.opencv = 'true'
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Impossible de charger OpenCV.js')) }
      script.onload  = () => setTimeout(() => waitForCv(), 500)
      document.head.appendChild(script)
    } else { waitForCv() }
  })
}

function _readExifOrientation(base64: string): number {
  try {
    const binary = atob(base64.slice(0, 1024))
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1
    let offset = 2
    while (offset < bytes.length - 4) {
      if (bytes[offset] !== 0xFF) break
      const marker = bytes[offset + 1]!
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
      if (marker === 0xE1) {
        const exifHeader = String.fromCharCode(...Array.from(bytes.slice(offset + 4, offset + 10)))
        if (!exifHeader.startsWith('Exif')) break
        const tiffOffset = offset + 10
        const isLE = bytes[tiffOffset] === 0x49
        const readU16 = (o: number) => isLE ? (bytes[tiffOffset + o]! | (bytes[tiffOffset + o + 1]! << 8)) : ((bytes[tiffOffset + o]! << 8) | bytes[tiffOffset + o + 1]!)
        const readU32 = (o: number) => isLE ? (bytes[tiffOffset + o]! | (bytes[tiffOffset + o + 1]! << 8) | (bytes[tiffOffset + o + 2]! << 16) | (bytes[tiffOffset + o + 3]! << 24)) : ((bytes[tiffOffset + o]! << 24) | (bytes[tiffOffset + o + 1]! << 16) | (bytes[tiffOffset + o + 2]! << 8) | bytes[tiffOffset + o + 3]!)
        const ifdOffset = readU32(4); const numEntries = readU16(ifdOffset)
        for (let i = 0; i < numEntries; i++) { const entryOffset = ifdOffset + 2 + i * 12; if (readU16(entryOffset) === 0x0112) return readU16(entryOffset + 8) }
        break
      }
      offset += 2 + length
    }
  } catch { /* silent */ }
  return 1
}

async function _createOrientedImage(base64: string, mime: string): Promise<HTMLImageElement> {
  const orientation = mime === 'image/jpeg' ? _readExifOrientation(base64) : 1
  if (orientation === 1) {
    return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(img); img.src = `data:${mime};base64,${base64}` })
  }
  const rawImg = await new Promise<HTMLImageElement>((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(img); img.src = `data:${mime};base64,${base64}` })
  const w = rawImg.naturalWidth; const h = rawImg.naturalHeight
  const tmpCanvas = document.createElement('canvas'); const tmpCtx = tmpCanvas.getContext('2d')!
  const swapDims = orientation >= 5
  tmpCanvas.width = swapDims ? h : w; tmpCanvas.height = swapDims ? w : h
  switch (orientation) {
    case 2: tmpCtx.transform(-1,0,0,1,w,0); break
    case 3: tmpCtx.transform(-1,0,0,-1,w,h); break
    case 4: tmpCtx.transform(1,0,0,-1,0,h); break
    case 5: tmpCtx.transform(0,1,1,0,0,0); break
    case 6: tmpCtx.transform(0,1,-1,0,h,0); break
    case 7: tmpCtx.transform(0,-1,-1,0,h,w); break
    case 8: tmpCtx.transform(0,-1,1,0,0,w); break
  }
  tmpCtx.drawImage(rawImg, 0, 0)
  return new Promise((resolve) => { const correctedImg = new Image(); correctedImg.onload = () => resolve(correctedImg); correctedImg.onerror = () => resolve(correctedImg); correctedImg.src = tmpCanvas.toDataURL(mime) })
}

onMounted(async () => {
  try { await _loadOpenCv(); isLoadingCv.value = false; await nextTick(); await _initCanvas() }
  catch { cvError.value = 'OpenCV non disponible — recadrage manuel uniquement.'; isLoadingCv.value = false; await nextTick(); await _initCanvasFallback() }
})

async function _initCanvas(): Promise<void> {
  const img = await _createOrientedImage(props.imageBase64, props.mimeType)
  imgNaturalW.value = img.naturalWidth; imgNaturalH.value = img.naturalHeight
  _resizeCanvas(img); _drawImageOnCanvas(img)
  if (cv) _detectDocumentCorners()
  _drawOverlay()
}

async function _initCanvasFallback(): Promise<void> {
  const img = await _createOrientedImage(props.imageBase64, props.mimeType)
  imgNaturalW.value = img.naturalWidth; imgNaturalH.value = img.naturalHeight
  _resizeCanvas(img); _drawImageOnCanvas(img); _drawOverlay()
}

function _resizeCanvas(img: HTMLImageElement): void {
  if (!canvasEl.value || !containerEl.value) return
  const containerWidth = containerEl.value.clientWidth || 340
  const ratio = img.naturalHeight / img.naturalWidth
  const w = Math.min(containerWidth, 640); const h = Math.round(w * ratio)
  displayW.value = w; displayH.value = h
  canvasEl.value.width = w; canvasEl.value.height = h
  if (hiddenCanvasEl.value) { hiddenCanvasEl.value.width = img.naturalWidth; hiddenCanvasEl.value.height = img.naturalHeight }
}

function _drawImageOnCanvas(img: HTMLImageElement): void {
  const ctx = canvasEl.value?.getContext('2d'); if (ctx) ctx.drawImage(img, 0, 0, displayW.value, displayH.value)
  const hidCtx = hiddenCanvasEl.value?.getContext('2d'); if (hidCtx) hidCtx.drawImage(img, 0, 0, imgNaturalW.value, imgNaturalH.value)
}

function _detectDocumentCorners(): void {
  if (!cv || !hiddenCanvasEl.value) return
  let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any
  try {
    src = cv.imread(hiddenCanvasEl.value); gray = new cv.Mat(); blurred = new cv.Mat(); edges = new cv.Mat(); contours = new cv.MatVector(); hierarchy = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0); cv.Canny(blurred, edges, 30, 100)
    const kernel = cv.Mat.ones(15, 15, cv.CV_8U); cv.dilate(edges, edges, kernel); kernel.delete()
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    let largestContour: any = null; let largestArea = 0
    for (let i = 0; i < contours.size(); i++) { const contour = contours.get(i); const area = cv.contourArea(contour); if (area > largestArea) { largestArea = area; largestContour?.delete(); largestContour = contour } else { contour.delete() } }
    if (!largestContour) return
    const peri = cv.arcLength(largestContour, true); let bestApprox: any = null
    for (const epsilonFactor of [0.02, 0.03, 0.04, 0.05, 0.08, 0.10]) { const approx = new cv.Mat(); cv.approxPolyDP(largestContour, approx, epsilonFactor * peri, true); if (approx.rows === 4) { bestApprox = approx; break } approx.delete() }
    largestContour.delete()
    if (bestApprox) { const pts: [number, number][] = []; for (let r = 0; r < 4; r++) { const x = bestApprox.data32S[r * 2]!; const y = bestApprox.data32S[r * 2 + 1]!; pts.push([x / imgNaturalW.value, y / imgNaturalH.value]) }; corners.value = _sortCorners(pts); bestApprox.delete() }
  } catch { /* silent */ } finally {
    try { src?.delete() } catch { /* ignore */ }; try { gray?.delete() } catch { /* ignore */ }; try { blurred?.delete() } catch { /* ignore */ }
    try { edges?.delete() } catch { /* ignore */ }; try { contours?.delete() } catch { /* ignore */ }; try { hierarchy?.delete() } catch { /* ignore */ }
  }
}

function _sortCorners(pts: [number, number][]): [number, number][] {
  const sums = pts.map(([x, y]) => x + y); const diffs = pts.map(([x, y]) => x - y)
  const tl = pts[sums.indexOf(Math.min(...sums))]!; const br = pts[sums.indexOf(Math.max(...sums))]!
  const tr = pts[diffs.indexOf(Math.min(...diffs))]!; const bl = pts[diffs.indexOf(Math.max(...diffs))]!
  const crossProduct = (tr[0] - tl[0]) * (bl[1] - tl[1]) - (tr[1] - tl[1]) * (bl[0] - tl[0])
  return crossProduct < 0 ? [tl, bl, br, tr] : [tl, tr, br, bl]
}

function _drawOverlay(): void {
  const canvas = canvasEl.value; if (!canvas) return
  const ctx = canvas.getContext('2d'); if (!ctx) return
  const W = displayW.value; const H = displayH.value
  const hiddenCanvas = hiddenCanvasEl.value; if (!hiddenCanvas) return
  ctx.clearRect(0, 0, W, H); ctx.drawImage(hiddenCanvas, 0, 0, W, H)
  const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath(); ctx.moveTo(pts[0]![0], pts[0]![1]); ctx.lineTo(pts[1]![0], pts[1]![1]); ctx.lineTo(pts[2]![0], pts[2]![1]); ctx.lineTo(pts[3]![0], pts[3]![1]); ctx.closePath(); ctx.fill(); ctx.restore()
  ctx.beginPath(); ctx.moveTo(pts[0]![0], pts[0]![1]); ctx.lineTo(pts[1]![0], pts[1]![1]); ctx.lineTo(pts[2]![0], pts[2]![1]); ctx.lineTo(pts[3]![0], pts[3]![1]); ctx.closePath()
  // Bordure mauve au lieu du vert teal d'origine
  ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 2.5; ctx.stroke()
  for (const [x, y] of pts) {
    ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(167,139,250,0.2)'; ctx.fill()
    ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke()
  }
}

watch(corners, _drawOverlay, { deep: true })

const HANDLE_RADIUS_PX = 22

function _getCanvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  const canvas = canvasEl.value; if (!canvas) return null
  const rect = canvas.getBoundingClientRect(); const scaleX = displayW.value / rect.width; const scaleY = displayH.value / rect.height
  if (e instanceof TouchEvent) { const touch = e.touches[0] ?? e.changedTouches[0]; if (!touch) return null; return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY } }
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function _findNearestHandle(x: number, y: number): number {
  const W = displayW.value; const H = displayH.value; let best = -1; let bestDist = HANDLE_RADIUS_PX * HANDLE_RADIUS_PX
  corners.value.forEach(([nx, ny], i) => { const dist = (x - nx * W) ** 2 + (y - ny * H) ** 2; if (dist < bestDist) { bestDist = dist; best = i } })
  return best
}

function onPointerDown(e: MouseEvent | TouchEvent): void { const pt = _getCanvasPoint(e); if (!pt) return; const idx = _findNearestHandle(pt.x, pt.y); if (idx !== -1) { dragIndex.value = idx; e.preventDefault() } }
function onPointerMove(e: MouseEvent | TouchEvent): void { if (dragIndex.value === -1) return; const pt = _getCanvasPoint(e); if (!pt) return; const nx = Math.max(0, Math.min(1, pt.x / displayW.value)); const ny = Math.max(0, Math.min(1, pt.y / displayH.value)); const updated = [...corners.value] as [number, number][]; updated[dragIndex.value] = [nx, ny]; corners.value = updated; e.preventDefault() }
function onPointerUp(): void { dragIndex.value = -1 }

async function confirmCrop(): Promise<void> {
  if (!cv || !hiddenCanvasEl.value) { emit('confirm', props.imageBase64); return }
  isProcessing.value = true; await nextTick()
  let src: any, dst: any, srcPts: any, dstPts: any, M: any
  try {
    const W = imgNaturalW.value; const H = imgNaturalH.value
    const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]
    const _dist = (a: [number, number], b: [number, number]) => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    const outW = Math.round(Math.max(_dist(pts[0]!, pts[1]!), _dist(pts[3]!, pts[2]!))); const outH = Math.round(Math.max(_dist(pts[0]!, pts[3]!), _dist(pts[1]!, pts[2]!)))
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1], pts[2]![0], pts[2]![1], pts[3]![0], pts[3]![1]])
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH])
    src = cv.imread(hiddenCanvasEl.value); dst = new cv.Mat(); M = cv.getPerspectiveTransform(srcPts, dstPts)
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH))
    const outCanvas = document.createElement('canvas'); outCanvas.width = outW; outCanvas.height = outH; cv.imshow(outCanvas, dst)
    const mimeOut = props.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'; const quality = mimeOut === 'image/jpeg' ? 0.92 : undefined
    const dataUri = outCanvas.toDataURL(mimeOut, quality); const base64Result = dataUri.split(',')[1] ?? props.imageBase64; emit('confirm', base64Result)
  } catch { emit('confirm', props.imageBase64) } finally {
    try { src?.delete() } catch { /* ignore */ }; try { dst?.delete() } catch { /* ignore */ }; try { srcPts?.delete() } catch { /* ignore */ }; try { dstPts?.delete() } catch { /* ignore */ }; try { M?.delete() } catch { /* ignore */ }
    isProcessing.value = false
  }
}
</script>

<template>
  <div ref="containerEl" class="flex w-full flex-col gap-4">

    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-tidy-text-primary">Ajustez les coins du document</p>
      <p class="text-xs text-tidy-text-secondary">Faites glisser les points</p>
    </div>

    <!-- Chargement OpenCV -->
    <div
      v-if="isLoadingCv"
      class="flex h-48 w-full items-center justify-center glass-panel"
    >
      <div class="flex flex-col items-center gap-2">
        <svg class="h-6 w-6 animate-spin text-tidy-mauve" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p class="text-xs text-tidy-text-secondary">Chargement du moteur de détection…</p>
      </div>
    </div>

    <!-- Avertissement OpenCV manquant -->
    <div
      v-if="cvError && !isLoadingCv"
      class="rounded-2xl border border-tidy-status-warning/30 bg-tidy-status-warning/10 px-3 py-2 text-xs text-tidy-status-warning"
    >
      {{ cvError }}
    </div>

    <!-- Canvas recadrage -->
    <div
      v-show="!isLoadingCv"
      class="relative w-full overflow-hidden rounded-3xl border border-tidy-border-glass shadow-lg"
      :style="{ touchAction: 'none' }"
    >
      <canvas
        ref="canvasEl"
        class="block w-full"
        style="cursor: crosshair; touch-action: none;"
        @mousedown="onPointerDown"
        @mousemove="onPointerMove"
        @mouseup="onPointerUp"
        @mouseleave="onPointerUp"
        @touchstart.passive="onPointerDown"
        @touchmove.prevent="onPointerMove"
        @touchend="onPointerUp"
      />
      <canvas ref="hiddenCanvasEl" class="hidden" aria-hidden="true" />
    </div>

    <!-- Confirmer -->
    <button
      type="button"
      class="btn-primary"
      :disabled="isProcessing || isLoadingCv"
      @click="confirmCrop"
    >
      <template v-if="isProcessing">
        <svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Recadrage en cours…
      </template>
      <template v-else>
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        Confirmer le recadrage
      </template>
    </button>

    <button
      type="button"
      class="text-center text-sm text-tidy-text-secondary underline underline-offset-2 active:opacity-70"
      @click="emit('cancel')"
    >
      Annuler
    </button>
  </div>
</template>
