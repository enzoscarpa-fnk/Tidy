<script setup lang="ts">
/**
 * ScanCropEditor — Détection de bords + recadrage perspective via OpenCV.js.
 *
 * Algorithme :
 *   1. L'image base64 est dessinée dans un <canvas> caché.
 *   2. OpenCV.js (chargé lazily) applique : Grayscale → GaussianBlur → Canny → findContours.
 *   3. Le plus grand contour à 4 points approximatif est sélectionné comme document.
 *   4. Les 4 coins sont affichés comme handles draggables sur le canvas visible.
 *   5. Confirmation → warpPerspective → base64 de l'image redressée.
 *
 * Fallback : si OpenCV ne charge pas ou si aucun contour n'est trouvé,
 *            les handles sont positionnés aux coins de l'image (crop simple).
 */

interface Props {
  imageBase64: string                       // base64 sans data URI prefix
  mimeType: 'image/jpeg' | 'image/png'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'confirm', result: string): void      // base64 sans data URI prefix
  (e: 'cancel'): void
}>()

// ── Refs DOM ───────────────────────────────────────────────────────────────

const canvasEl = ref<HTMLCanvasElement | null>(null)      // canvas visible (overlay)
const hiddenCanvasEl = ref<HTMLCanvasElement | null>(null) // canvas OpenCV (offscreen)
const containerEl = ref<HTMLDivElement | null>(null)

// ── État ───────────────────────────────────────────────────────────────────

const isLoadingCv = ref(true)
const cvError = ref<string | null>(null)
const isProcessing = ref(false)

/**
 * 4 points de contrôle en coordonnées NORMALISÉES [0..1].
 * Ordre : top-left, top-right, bottom-right, bottom-left (sens horaire).
 */
const corners = ref<[number, number][]>([
  [0.05, 0.05],
  [0.95, 0.05],
  [0.95, 0.95],
  [0.05, 0.95],
])

// Index du point en cours de déplacement (-1 = aucun)
const dragIndex = ref(-1)

// Dimensions de l'image originale
const imgNaturalW = ref(0)
const imgNaturalH = ref(0)

// Dimensions du canvas visible (= container responsive)
const displayW = ref(0)
const displayH = ref(0)

// ── Chargement OpenCV.js ───────────────────────────────────────────────────

let cv: any = null  // référence globale OpenCV (disponible via window.cv après chargement)

async function _loadOpenCv(): Promise<void> {
  // Si déjà chargé (rechargement de la page ou HMR)
  if ((window as any).cv && (window as any).cv.Mat) {
    cv = (window as any).cv
    return
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://docs.opencv.org/4.10.0/opencv.js'
    script.async = true

    // OpenCV appelle window.onRuntimeInitialized quand le WASM est prêt
    ;(window as any).Module = {
      onRuntimeInitialized: () => {
        cv = (window as any).cv
        resolve()
      },
    }

    script.onerror = () => reject(new Error('Impossible de charger OpenCV.js'))
    document.head.appendChild(script)
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

/**
 * Charge l'image, dessine sur le canvas, lance la détection de bords.
 */
async function _initCanvas(): Promise<void> {
  const img = new Image()
  img.src = `data:${props.mimeType};base64,${props.imageBase64}`

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })

  imgNaturalW.value = img.naturalWidth
  imgNaturalH.value = img.naturalHeight

  _resizeCanvas(img)
  _drawImageOnCanvas(img)

  if (cv) {
    _detectDocumentCorners(img)
  }

  _drawOverlay()
}

/**
 * Fallback sans OpenCV : coins par défaut + image affichée.
 */
async function _initCanvasFallback(): Promise<void> {
  const img = new Image()
  img.src = `data:${props.mimeType};base64,${props.imageBase64}`

  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })

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
    hiddenCanvasEl.value.width = img.naturalWidth
    hiddenCanvasEl.value.height = img.naturalHeight
  }
}

function _drawImageOnCanvas(img: HTMLImageElement): void {
  const ctx = canvasEl.value?.getContext('2d')
  if (!ctx) return
  ctx.drawImage(img, 0, 0, displayW.value, displayH.value)

  // Copie dans le canvas caché à la résolution native pour OpenCV
  const hidCtx = hiddenCanvasEl.value?.getContext('2d')
  if (hidCtx) {
    hidCtx.drawImage(img, 0, 0, imgNaturalW.value, imgNaturalH.value)
  }
}

// ── Détection de bords OpenCV ──────────────────────────────────────────────

function _detectDocumentCorners(img: HTMLImageElement): void {
  if (!cv || !hiddenCanvasEl.value) return

  let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any
  try {
    src = cv.imread(hiddenCanvasEl.value)
    gray = new cv.Mat()
    blurred = new cv.Mat()
    edges = new cv.Mat()
    contours = new cv.MatVector()
    hierarchy = new cv.Mat()

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    cv.Canny(blurred, edges, 75, 200)

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    // Trouver le plus grand contour à 4 côtés (approximation polygonale)
    let bestContour: any = null
    let bestArea = 0

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const peri = cv.arcLength(contour, true)
      const approx = new cv.Mat()
      cv.approxPolyDP(contour, approx, 0.02 * peri, true)

      if (approx.rows === 4) {
        const area = cv.contourArea(approx)
        if (area > bestArea) {
          bestArea = area
          bestContour = approx
        } else {
          approx.delete()
        }
      } else {
        approx.delete()
      }
      contour.delete()
    }

    // Surface minimale : 10% de l'image
    const minArea = imgNaturalW.value * imgNaturalH.value * 0.1

    if (bestContour && bestArea > minArea) {
      // Extraire les 4 points et les trier (TL, TR, BR, BL)
      const pts: [number, number][] = []
      for (let r = 0; r < 4; r++) {
        pts.push([
          bestContour.intAt(r, 0) / imgNaturalW.value,
          bestContour.intAt(r, 1) / imgNaturalH.value,
        ])
      }
      corners.value = _sortCorners(pts)
      bestContour.delete()
    }
    // Sinon : garder les coins par défaut [0.05, 0.95]
  } catch {
    // Détection silencieuse — fallback sur les coins par défaut
  } finally {
    try { src?.delete() } catch { /* ignore */ }
    try { gray?.delete() } catch { /* ignore */ }
    try { blurred?.delete() } catch { /* ignore */ }
    try { edges?.delete() } catch { /* ignore */ }
    try { contours?.delete() } catch { /* ignore */ }
    try { hierarchy?.delete() } catch { /* ignore */ }
  }
}

/**
 * Trie 4 points dans l'ordre TL, TR, BR, BL.
 * Méthode : somme (x+y) min = TL, max = BR ; diff (x-y) min = TR, max = BL.
 */
function _sortCorners(pts: [number, number][]): [number, number][] {
  const sums = pts.map(([x, y]) => x + y)
  const diffs = pts.map(([x, y]) => x - y)

  const tl = pts[sums.indexOf(Math.min(...sums))]!
  const br = pts[sums.indexOf(Math.max(...sums))]!
  const tr = pts[diffs.indexOf(Math.min(...diffs))]!
  const bl = pts[diffs.indexOf(Math.max(...diffs))]!

  return [tl, tr, br, bl]
}

// ── Overlay (quadrilatère + handles) ──────────────────────────────────────

function _drawOverlay(): void {
  const canvas = canvasEl.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = displayW.value
  const H = displayH.value

  // Redessiner l'image en dessous
  const img = new Image()
  img.src = `data:${props.mimeType};base64,${props.imageBase64}`
  img.onload = () => {
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(img, 0, 0, W, H)

    const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]

    // Overlay semi-transparent autour du document
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, 0, W, H)

    // Découper la zone du document (effet de "fenêtre")
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(pts[0]![0], pts[0]![1])
    ctx.lineTo(pts[1]![0], pts[1]![1])
    ctx.lineTo(pts[2]![0], pts[2]![1])
    ctx.lineTo(pts[3]![0], pts[3]![1])
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // Bordure du quadrilatère
    ctx.beginPath()
    ctx.moveTo(pts[0]![0], pts[0]![1])
    ctx.lineTo(pts[1]![0], pts[1]![1])
    ctx.lineTo(pts[2]![0], pts[2]![1])
    ctx.lineTo(pts[3]![0], pts[3]![1])
    ctx.closePath()
    ctx.strokeStyle = '#01696f'  // tidy-primary
    ctx.lineWidth = 2.5
    ctx.stroke()

    // Handles (cercles blancs aux coins)
    for (const [x, y] of pts) {
      ctx.beginPath()
      ctx.arc(x, y, 14, 0, Math.PI * 2)
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.strokeStyle = '#01696f'
      ctx.lineWidth = 2.5
      ctx.stroke()

      // Croix centrale dans le handle
      ctx.beginPath()
      ctx.moveTo(x - 5, y)
      ctx.lineTo(x + 5, y)
      ctx.moveTo(x, y - 5)
      ctx.lineTo(x, y + 5)
      ctx.strokeStyle = '#01696f'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

// Watcher : redessiner l'overlay à chaque déplacement de coins
watch(corners, _drawOverlay, { deep: true })

// ── Gestion du drag des handles ────────────────────────────────────────────

const HANDLE_RADIUS_PX = 22  // zone de détection (plus grande que le handle visuel)

function _getCanvasPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  const canvas = canvasEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = displayW.value / rect.width
  const scaleY = displayH.value / rect.height

  if (e instanceof TouchEvent) {
    const touch = e.touches[0] ?? e.changedTouches[0]
    if (!touch) return null
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    }
  }
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

function _findNearestHandle(x: number, y: number): number {
  const W = displayW.value
  const H = displayH.value
  let best = -1
  let bestDist = HANDLE_RADIUS_PX * HANDLE_RADIUS_PX

  corners.value.forEach(([nx, ny], i) => {
    const px = nx * W
    const py = ny * H
    const dist = (x - px) ** 2 + (y - py) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  return best
}

function onPointerDown(e: MouseEvent | TouchEvent): void {
  const pt = _getCanvasPoint(e)
  if (!pt) return
  const idx = _findNearestHandle(pt.x, pt.y)
  if (idx !== -1) {
    dragIndex.value = idx
    e.preventDefault()
  }
}

function onPointerMove(e: MouseEvent | TouchEvent): void {
  if (dragIndex.value === -1) return
  const pt = _getCanvasPoint(e)
  if (!pt) return

  const W = displayW.value
  const H = displayH.value

  // Clamp dans les limites du canvas
  const nx = Math.max(0, Math.min(1, pt.x / W))
  const ny = Math.max(0, Math.min(1, pt.y / H))

  const updated = [...corners.value] as [number, number][]
  updated[dragIndex.value] = [nx, ny]
  corners.value = updated

  e.preventDefault()
}

function onPointerUp(): void {
  dragIndex.value = -1
}

// ── Application de la transformation perspective ───────────────────────────

async function confirmCrop(): Promise<void> {
  if (!cv || !hiddenCanvasEl.value) {
    // Fallback sans OpenCV : retourner l'image originale
    emit('confirm', props.imageBase64)
    return
  }

  isProcessing.value = true

  await nextTick() // laisser le temps de rendre l'état "processing"

  let src: any, dst: any, srcPts: any, dstPts: any, M: any
  try {
    const W = imgNaturalW.value
    const H = imgNaturalH.value

    // Points source : positions en pixels natifs
    const pts = corners.value.map(([nx, ny]) => [nx * W, ny * H]) as [number, number][]

    // Calculer la largeur/hauteur de sortie (distance entre coins opposés)
    const _dist = (a: [number, number], b: [number, number]) =>
      Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)

    const outW = Math.round(Math.max(_dist(pts[0]!, pts[1]!), _dist(pts[3]!, pts[2]!)))
    const outH = Math.round(Math.max(_dist(pts[0]!, pts[3]!), _dist(pts[1]!, pts[2]!)))

    // Construire les matrices de transformation
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pts[0]![0], pts[0]![1],
      pts[1]![0], pts[1]![1],
      pts[2]![0], pts[2]![1],
      pts[3]![0], pts[3]![1],
    ])

    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outW, 0,
      outW, outH,
      0, outH,
    ])

    src = cv.imread(hiddenCanvasEl.value)
    dst = new cv.Mat()
    M = cv.getPerspectiveTransform(srcPts, dstPts)
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH))

    // Exporter le résultat vers un canvas temporaire, puis en base64
    const outCanvas = document.createElement('canvas')
    outCanvas.width = outW
    outCanvas.height = outH
    cv.imshow(outCanvas, dst)

    const mimeOut = props.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = mimeOut === 'image/jpeg' ? 0.92 : undefined
    const dataUri = outCanvas.toDataURL(mimeOut, quality)
    // Supprimer le préfixe "data:image/...;base64,"
    const base64Result = dataUri.split(',')[1] ?? props.imageBase64

    emit('confirm', base64Result)
  } catch {
    // En cas d'erreur, retourner l'image d'origine
    emit('confirm', props.imageBase64)
  } finally {
    try { src?.delete() } catch { /* ignore */ }
    try { dst?.delete() } catch { /* ignore */ }
    try { srcPts?.delete() } catch { /* ignore */ }
    try { dstPts?.delete() } catch { /* ignore */ }
    try { M?.delete() } catch { /* ignore */ }
    isProcessing.value = false
  }
}
</script>

<template>
  <div ref="containerEl" class="flex w-full flex-col gap-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold text-tidy-text-primary">
        Ajustez les coins du document
      </p>
      <p class="text-xs text-tidy-text-secondary">Faites glisser les points blancs</p>
    </div>

    <!-- Loader OpenCV -->
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

    <!-- Message erreur OpenCV (fallback manuel) -->
    <div
      v-if="cvError && !isLoadingCv"
      class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700"
    >
      {{ cvError }}
    </div>

    <!-- Canvas interactif -->
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
      <!-- Canvas caché pour OpenCV (résolution native, non rendu) -->
      <canvas ref="hiddenCanvasEl" class="hidden" aria-hidden="true" />
    </div>

    <!-- Actions -->
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
