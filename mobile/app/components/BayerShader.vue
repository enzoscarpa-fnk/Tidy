<script setup lang="ts">
/**
 * BayerShader.vue — Bayer 8×8, mauve→orange, bords sans barrière.
 * Le canvas est fixed inset-0 avec w-full h-full — il couvre toute
 * la fenêtre du navigateur y compris les zones safe-area.
 * On utilise 100dvh (dynamic viewport height) via CSS pour couvrir
 * aussi la barre d'adresse sur iOS Safari/WKWebView.
 */

interface Props {
  opacity?: number
}
const props = withDefaults(defineProps<Props>(), { opacity: 0.20 })
const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx  = canvas.getContext('2d')!
  const buf  = document.createElement('canvas')
  const bctx = buf.getContext('2d')!

  const CELL = 2
  let bw = 0, bh = 0
  let animId = 0
  let last   = 0

  const BAYER = [
    0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ]

  function getColor(nx: number, ny: number): [number, number, number] {
    const t = Math.max(0, Math.min(1, ny * 0.85 + nx * 0.15))
    return [
      Math.round(167 + (249 - 167) * t),
      Math.round(139 + (115 - 139) * t),
      Math.round(250 + ( 22 - 250) * t),
    ]
  }

  function resize(): void {
    // Utiliser la taille réelle de la fenêtre (inclut safe areas)
    const W = window.innerWidth
    const H = window.innerHeight
    bw = Math.max(1, Math.ceil(W / CELL))
    bh = Math.max(1, Math.ceil(H / CELL))
    canvas.width  = bw
    canvas.height = bh
    buf.width     = bw
    buf.height    = bh
    canvas.style.imageRendering = 'pixelated'
    ;(canvas.style as any).msInterpolationMode = 'nearest-neighbor'
  }

  function frame(t: number): void {
    animId = requestAnimationFrame(frame)
    if (t - last < 40) return
    last = t

    const img  = bctx.createImageData(bw, bh)
    const data = img.data
    const MARGIN = 0.25

    for (let y = 0; y < bh; y++) {
      const ny = (y / bh) * (1 + 2 * MARGIN) - MARGIN
      for (let x = 0; x < bw; x++) {
        const nx = (x / bw) * (1 + 2 * MARGIN) - MARGIN

        let v = 0.5
        v += 0.28 * Math.sin(nx * 3.1 + t * 0.00026)
        v += 0.28 * Math.sin(ny * 4.0 - t * 0.00034)
        v += 0.16 * Math.sin((nx + ny) * 5.5 + t * 0.00048)
        v += 0.10 * Math.cos((nx - ny) * 4.2 - t * 0.00020)
        v = v * 0.42 + 0.11

        const threshold = (BAYER[(y & 7) * 8 + (x & 7)]! + 0.5) / 64
        const i = (y * bw + x) * 4

        if (v > threshold) {
          const [r, g, b] = getColor(
            Math.max(0, Math.min(1, (nx + MARGIN) / (1 + 2 * MARGIN))),
            Math.max(0, Math.min(1, (ny + MARGIN) / (1 + 2 * MARGIN))),
          )
          data[i]     = r
          data[i + 1] = g
          data[i + 2] = b
          data[i + 3] = 255
        }
      }
    }

    bctx.putImageData(img, 0, 0)
    ctx.clearRect(0, 0, bw, bh)
    ctx.drawImage(buf, 0, 0)
  }

  resize()
  animId = requestAnimationFrame(frame)

  // ResizeObserver sur window via listener (canvas fixed ne reflète pas offsetWidth correctement)
  window.addEventListener('resize', resize)

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
  })
})
</script>

<template>
  <!--
    fixed inset-0 : couvre toute la fenêtre du navigateur.
    La hauteur est pilotée par window.innerHeight dans le script,
    qui inclut les zones safe-area sur iOS.
    w-screen h-screen en CSS comme fallback visuel.
  -->
  <canvas
    ref="canvasRef"
    class="fixed inset-0 pointer-events-none"
    style="width: 100vw; height: 100vh;"
    :style="{ opacity: props.opacity }"
    aria-hidden="true"
  />
</template>
