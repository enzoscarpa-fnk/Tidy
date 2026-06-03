<script setup lang="ts">
/**
 * ScanCropEditor — Détection de bords + recadrage perspective via OpenCV.js.
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

// ── Refs DOM ───────────────────────────────────────────────────────────────

const canvasEl       = ref<HTMLCanvasElement | null>(null)
const hiddenCanvasEl = ref<HTMLCanvasElement | null>(null)
const containerEl    = ref<HTMLDivElement | null>(null)

// ── État ───────────────────────────────────────────────────────────────────

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

// ── Chargement OpenCV.js ───────────────────────────────────────────────────

let cv: any = null

async function _loadOpenCv(): Promise<void> {
  if ((window as any).cv?.Mat) {
    cv = (window as any).cv
    return
  }

  const existing = document.querySelector('script[data-opencv]')

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('OpenCV timeout')), 20_000)

    const prevInit = (window as any).Module?.onRuntimeInitialized
    ;(window as any).Module = {
      ...(window as any).Module,
      onRuntimeInitialized() {
        prevInit?.()
        cv = (window as any).cv
        clearTimeout(timeout)
        resolve()
      },
    }

    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://docs.opencv.org/4.10.0/opencv.js'
      script.async = true
      script.dataset.opencv = 'true'
      script.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Impossible de charger OpenCV.js'))
      }
      document.head.appendChild(script)
    }
  })
}

// ── Lecture orientation EXIF (JPEG uniquement) ─────────────────────────────
//
// Les photos de galerie iOS conservent leur orientation EXIF brute.
// Le canvas ignore ces métadonnées → image retournée/pivotée.
// On lit le tag 0x0112 (Orientation) dans les bytes JPEG et on retourne
// la rotation/flip à appliquer avant de dessiner sur le canvas.
//
// Valeurs EXIF Orientation :
//   1 = normal        2 = flip H
//   3 = rotation 180  4 = flip V
//   5 = flip H + 90°  6 = rotation 90° CW (cas le plus fréquent iOS galerie)
//   7 = flip H + 270° 8 = rotation 270° CW

function _readExifOrientation(base64: string): number {
  try {
    const binary = atob(base64.slice(0, 1024)) // on n'a besoin que du début
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // Vérifier la signature JPEG (FFD8)
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1

    let offset = 2
    while (offset < bytes.length - 4) {
      if (bytes[offset] !== 0xFF) break
      const marker = bytes[offset + 1]!
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!

      // APP1 marker (0xE1) contient l'EXIF
      if (marker === 0xE1) {
        // Vérifier "Exif\0\0"
        const exifHeader = String.fromCharCode(...Array.from(bytes.slice(offset + 4, offset + 10)))
        if (!exifHeader.startsWith('Exif')) break

        const tiffOffset = offset + 10
        const isLE = bytes[tiffOffset] === 0x49 // 'II' = little-endian

        const readU16 = (o: number) => isLE
          ? (bytes[tiffOffset + o]! | (bytes[tiffOffset + o + 1]! << 8))
          : ((bytes[tiffOffset + o]! << 8) | bytes[tiffOffset + o + 1]!)

        const readU32 = (o: number) => isLE
          ? (bytes[tiffOffset + o]! | (bytes[tiffOffset + o + 1]! << 8) |
            (bytes[tiffOffset + o + 2]! << 16) | (bytes[tiffOffset + o + 3]! << 24))
          : ((bytes[tiffOffset + o]! << 24) | (bytes[tiffOffset + o + 1]! << 16) |
            (bytes[tiffOffset + o + 2]! << 8) | bytes[tiffOffset + o + 3]!)

        const ifdOffset  = readU32(4)
        const numEntries = readU16(ifdOffset)

        for (let i = 0; i < numEntries; i++) {
          const entryOffset = ifdOffset + 2 + i * 12
          const tag = readU16(entryOffset)
          if (tag === 0x0112) {
            return readU16(entryOffset + 8)
          }
        }
        break
      }

      offset += 2 + length
    }
  } catch {
    // Lecture silencieuse
  }
  return 1 // orientation normale par défaut
}

/**
 * Dessine l'image sur un canvas temporaire en appliquant la correction
 * d'orientation EXIF, et retourne un HTMLImageElement orienté correctement.
 */
async function _createOrientedImage(base64: string, mime: string): Promise<HTMLImageElement> {
  const orientation = mime === 'image/jpeg' ? _readExifOrientation(base64) : 1

  // Si orientation normale, pas de transformation nécessaire
  if (orientation === 1) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(img)
      img.src = `data:${mime};base64,${base64}`
    })
  }

  // Charger l'image brute
  const rawImg = await new Promise<HTMLImageElement>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
    img.src = `data:${mime};base64,${base64}`
  })

  const w = rawImg.naturalWidth
  const h = rawImg.naturalHeight

  // Créer un canvas de correction
  const tmpCanvas  = document.createElement('canvas')
  const tmpCtx     = tmpCanvas.getContext('2d')!

  // Orientations 5-8 : largeur et hauteur sont inversées
  const swapDims = orientation >= 5
  tmpCanvas.width  = swapDims ? h : w
  tmpCanvas.height = swapDims ? w : h

  // Appliquer la transformation
  switch (orientation) {
    case 2: tmpCtx.transform(-1, 0, 0, 1, w, 0);              break
    case 3: tmpCtx.transform(-1, 0, 0, -1, w, h);             break
    case 4: tmpCtx.transform(1, 0, 0, -1, 0, h);              break
    case 5: tmpCtx.transform(0, 1, 1, 0, 0, 0);               break
    case 6: tmpCtx.transform(0, 1, -1, 0, h, 0);              break
    case 7: tmpCtx.transform(0, -1, -1, 0, h, w);             break
    case 8: tmpCtx.transform(0, -1, 1, 0, 0, w);              break
  }

  tmpCtx.drawImage(rawImg, 0, 0)

  // Retourner une nouvelle image depuis le canvas corrigé
  return new Promise((resolve) => {
    const correctedImg = new Image()
    correctedImg.onload = () => resolve(correctedImg)
    correctedImg.onerror = () => resolve(correctedImg)
    correctedImg.src = tmpCanvas.toDataURL(mime)
  })
}

// ── Initialisation ─────────────────────────────────────────────────────────

onMounted(async () => {
  try {
    await _loadOpenCv()
    isLoadingCv.value = false
    await nextTick()
    await _initCanvas()
  } catch {
    cvError.value = 'OpenCV non disponible — recadrage manuel uniquement.'
    isLoadingCv.value = false
    await nextTick()
    await _initCanvasFallback()
  }
})

async function _initCanvas(): Promise<void> {
  const img = await _createOrientedImage(props.imageBase64, props.mimeType)
  imgNaturalW.value = img.naturalWidth
  imgNaturalH.value = img.naturalHeight
  _resizeCanvas(img)
  _drawImageOnCanvas(img)
  if (cv) _detectDocumentCorners()
  _drawOverlay()
}

async function _initCanvasFallback(): Promise<void> {
  const img = await _createOrientedImage(props.imageBase64, props.mimeType)
  imgNaturalW.value = img.naturalWidth
  imgNaturalH.value = img.naturalHeight
  _resizeCanvas(img)
  _drawImageOnCanvas(img)
  _drawOverlay()
}

// ── Utilitaires canvas ─────────────────────────────────────────────────────

function _resizeCanvas(img: HTMLImageElement): void {
  if (!canvasEl.value || !containerEl.value) return
  const containerWidth = containerEl.value.clientWidth || 340
  const ratio = img.naturalHeight / img.naturalWidth
  const w = Math.min(containerWidth, 640)
  const h = Math.round(w * ratio)
  displayW.value = w
  displayH.value = h
  canvasEl.value.width = w
  canvasEl.value.height = h
  if (hiddenCanvasEl.value) {
    hiddenCanvasEl.value.width  = img.naturalWidth
    hiddenCanvasEl.value.height = img.naturalHeight
  }
}

function _drawImageOnCanvas(img: HTMLImageElement): void {
  const ctx = canvasEl.value?.getContext('2d')
  if (ctx) ctx.drawImage(img, 0, 0, displayW.value, displayH.value)
  const hidCtx = hiddenCanvasEl.value?.getContext('2d')
  if (hidCtx) hidCtx.drawImage(img, 0, 0, imgNaturalW.value, imgNaturalH.value)
}

// ── Détection de bords OpenCV ──────────────────────────────────────────────

function _detectDocumentCorners(): void {
  if (!cv || !hiddenCanvasEl.value) return

  let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any
  try {
    src       = cv.imread(hiddenCanvasEl.value)
    gray      = new cv.Mat()
    blurred   = new cv.Mat()
    edges     = new cv.Mat()
    contours  = new cv.MatVector()
    hierarchy = new cv.Mat()

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 75, 200)

    const kernel = cv.Mat.ones(3, 3, cv.CV_8U)
    cv.dilate(edges, edges, kernel)
    kernel.delete()

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let bestContour: any = null
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const peri    = cv.arcLength(contour, true)
      const approx  = new cv.Mat()
      cv.approxPolyDP(contour, approx, 0.02 * peri, true)

      if (approx.rows === 4) {
        const area = cv.contourArea(approx)
        if (area > bestArea) {
          bestArea = area
          bestContour?.delete()
          bestContour = approx
        } else {
          approx.delete()
        }
      } else {
        approx.delete()
      }
      contour.delete()
    }

    const minArea = imgNaturalW.value * imgNaturalH.value * 0.10

    if (bestContour && bestArea > minArea) {
      const pts: [number, number][] = []
      for (let r = 0; r < 4; r++) {
        const x = bestContour.data32S[r * 2]!
        const y = bestContour.data32S[r * 2 + 1]!
        pts.push([x / imgNaturalW.value, y / imgNaturalH.value])
      }
      corners.value = _sortCorners(pts)
      bestContour.delete()
    }
  } catch (err) {
    console.warn('[ScanCropEditor] Détection échouée, fallback coins par défaut', err)
  } finally {
    try { src?.delete()       } catch { /* ignore */ }
    try { gray?.delete()      } catch { /* ignore */ }
    try { blurred?.delete()   } catch { /* ignore */ }
    try { edges?.delete()     } catch { /* ignore */ }
    try { contours?.delete()  } catch { /* ignore */ }
    try { hierarchy?.delete() } catch { /* ignore */ }
  }
}

function _sortCorners(pts: [number, number][]): [number, number][] {
  const sums  = pts.map(([x, y]) => x + y)
  const diffs = pts.map(([x, y]) => x - y)
  const tl = pts[sums.indexOf(Math.min(...sums))]!
  const br = pts[sums.indexOf(Math.max(...sums))]!
  const tr = pts[diffs.indexOf(Math.min(...diffs))]!
  const bl = pts[diffs.indexOf(Math.max(...diffs))]!
  return [tl, tr, br, bl]
}

// ── Overlay ────────────────────────────────────────────────────────────────

function _drawOverlay(): void {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = displayW.value
  const H = displayH.value

  // On redessine depuis le canvas caché (déjà orienté) pour éviter une
  // nouvelle correction d'orientation à chaque redraw de l'overlay
  const hiddenCanvas = hiddenCanvasEl.value
  if (!hiddenCanvas) return

  ctx.clearRect(0, 0, W, H)
  ctx.drawImage(hiddenCanvas, 0, 0, W, H)

  const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]

  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  ctx.lineTo(pts[1]![0], pts[1]![1])
  ctx.lineTo(pts[2]![0], pts[2]![1])
  ctx.lineTo(pts[3]![0], pts[3]![1])
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.beginPath()
  ctx.moveTo(pts[0]![0], pts[0]![1])
  ctx.lineTo(pts[1]![0], pts[1]![1])
  ctx.lineTo(pts[2]![0], pts[2]![1])
  ctx.lineTo(pts[3]![0], pts[3]![1])
  ctx.closePath()
  ctx.strokeStyle = '#01696f'
  ctx.lineWidth   = 2.5
  ctx.stroke()

  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fillStyle   = 'white'
    ctx.fill()
    ctx.strokeStyle = '#01696f'
    ctx.lineWidth   = 2.5
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y)
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5)
    ctx.strokeStyle = '#01696f'
    ctx.lineWidth   = 1.5
    ctx.stroke()
  }
}

watch(corners, _drawOverlay, { deep: true })

// ── Drag handles ───────────────────────────────────────────────────────────

const HANDLE_RADIUS_PX = 22

function _getCanvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  const canvas = canvasEl.value
  if (!canvas) return null
  const rect   = canvas.getBoundingClientRect()
  const scaleX = displayW.value / rect.width
  const scaleY = displayH.value / rect.height
  if (e instanceof TouchEvent) {
    const touch = e.touches[0] ?? e.changedTouches[0]
    if (!touch) return null
    return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
  }
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
}

function _findNearestHandle(x: number, y: number): number {
  const W = displayW.value
  const H = displayH.value
  let best = -1
  let bestDist = HANDLE_RADIUS_PX * HANDLE_RADIUS_PX
  corners.value.forEach(([nx, ny], i) => {
    const dist = (x - nx * W) ** 2 + (y - ny * H) ** 2
    if (dist < bestDist) { bestDist = dist; best = i }
  })
  return best
}

function onPointerDown(e: MouseEvent | TouchEvent): void {
  const pt  = _getCanvasPoint(e)
  if (!pt) return
  const idx = _findNearestHandle(pt.x, pt.y)
  if (idx !== -1) { dragIndex.value = idx; e.preventDefault() }
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  if (dragIndex.value === -1) return
  const pt = _getCanvasPoint(e)
  if (!pt) return
  const nx = Math.max(0, Math.min(1, pt.x / displayW.value))
  const ny = Math.max(0, Math.min(1, pt.y / displayH.value))
  const updated = [...corners.value] as [number, number][]
  updated[dragIndex.value] = [nx, ny]
  corners.value = updated
  e.preventDefault()
}

function onPointerUp(): void { dragIndex.value = -1 }

// ── Transformation perspective ─────────────────────────────────────────────
// Le canvas caché contient déjà l'image orientée correctement →
// warpPerspective travaille sur des données cohérentes.

async function confirmCrop(): Promise<void> {
  if (!cv || !hiddenCanvasEl.value) {
    emit('confirm', props.imageBase64)
    return
  }
  isProcessing.value = true
  await nextTick()

  let src: any, dst: any, srcPts: any, dstPts: any, M: any
  try {
    const W   = imgNaturalW.value
    const H   = imgNaturalH.value
    const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]
    const _dist = (a: [number, number], b: [number, number]) =>
      Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    const outW = Math.round(Math.max(_dist(pts[0]!, pts[1]!), _dist(pts[3]!, pts[2]!)))
    const outH = Math.round(Math.max(_dist(pts[0]!, pts[3]!), _dist(pts[1]!, pts[2]!)))

    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pts[0]![0], pts[0]![1],
      pts[1]![0], pts[1]![1],
      pts[2]![0], pts[2]![1],
      pts[3]![0], pts[3]![1],
    ])
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, outW, 0, outW, outH, 0, outH,
    ])
    // imread depuis le canvas caché — déjà orienté correctement
    src = cv.imread(hiddenCanvasEl.value)
    dst = new cv.Mat()
    M   = cv.getPerspectiveTransform(srcPts, dstPts)
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH))

    const outCanvas  = document.createElement('canvas')
    outCanvas.width  = outW
    outCanvas.height = outH
    cv.imshow(outCanvas, dst)

    const mimeOut      = props.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality      = mimeOut === 'image/jpeg' ? 0.92 : undefined
    const dataUri      = outCanvas.toDataURL(mimeOut, quality)
    const base64Result = dataUri.split(',')[1] ?? props.imageBase64
    emit('confirm', base64Result)
  } catch {
    emit('confirm', props.imageBase64)
  } finally {
    try { src?.delete()    } catch { /* ignore */ }
    try { dst?.delete()    } catch { /* ignore */ }
    try { srcPts?.delete() } catch { /* ignore */ }
    try { dstPts?.delete() } catch { /* ignore */ }
    try { M?.delete()      } catch { /* ignore */ }
    isProcessing.value = false
  }
}
</script>

<template>
  <div ref="containerEl" class="flex w-full flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-tidy-text-primary">Ajustez les coins du document</p>
      <p class="text-xs text-tidy-text-secondary">Faites glisser les points blancs</p>
    </div>

    <div
      v-if="isLoadingCv"
      class="flex h-48 w-full items-center justify-center rounded-2xl border border-tidy-border bg-white"
    >
      <div class="flex flex-col items-center gap-2">
        <svg class="h-6 w-6 animate-spin text-tidy-primary" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p class="text-xs text-tidy-text-secondary">Chargement du moteur de détection…</p>
      </div>
    </div>

    <div
      v-if="cvError && !isLoadingCv"
      class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
    >
      {{ cvError }}
    </div>

    <div
      v-show="!isLoadingCv"
      class="relative w-full overflow-hidden rounded-2xl border border-tidy-border shadow-sm"
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

    <button
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-2xl bg-tidy-primary px-6 py-4 text-base font-semibold text-white shadow-sm transition-opacity active:opacity-80 disabled:opacity-50"
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
