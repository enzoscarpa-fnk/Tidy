<script setup lang="ts">
const router = useRouter()

const EDGE_WIDTH = 36
const THRESHOLD  = 52   // seuil court → validation rapide, mouvement discret
const W          = typeof window !== 'undefined' ? window.innerWidth : 390

const startX     = ref(0)
const startY     = ref(0)
const dragX      = ref(0)
const isDragging = ref(false)
const axisLocked = ref<'h' | 'v' | null>(null)
const validated  = ref(false)

const progress = computed(() => Math.min(1, dragX.value / THRESHOLD))

// Translate max 45% de la largeur — le bord de la page reste visible,
// l'amplitude courte rend la transition discrète
const translateX = computed(() => {
  if (!isDragging.value && dragX.value === 0) return 0
  const ratio = dragX.value / W
  return W * 0.45 * (1 - Math.exp(-ratio * 3.5))
})

function onTouchStart(e: TouchEvent): void {
  const touch = e.touches[0]
  if (!touch || touch.clientX > EDGE_WIDTH) return
  startX.value = touch.clientX; startY.value = touch.clientY
  dragX.value = 0; isDragging.value = false; axisLocked.value = null; validated.value = false
}

function onTouchMove(e: TouchEvent): void {
  const touch = e.touches[0]
  if (!touch || startX.value === 0) return
  const dx = touch.clientX - startX.value
  const dy = Math.abs(touch.clientY - startY.value)
  if (!axisLocked.value) {
    if (Math.abs(dx) < 5 && dy < 5) return
    axisLocked.value = dy > Math.abs(dx) * 1.1 ? 'v' : 'h'
  }
  if (axisLocked.value === 'v') { startX.value = 0; return }
  if (dx <= 0) return
  isDragging.value = true
  dragX.value = Math.min(dx, W)
  e.preventDefault()
}

function onTouchEnd(): void {
  if (!isDragging.value) { reset(); return }
  if (dragX.value >= THRESHOLD && !validated.value) {
    validated.value = true
    setTimeout(() => {
      dragX.value = 0; isDragging.value = false; startX.value = 0
      router.back()
    }, 100)
  } else {
    dragX.value = 0; isDragging.value = false; startX.value = 0
  }
}

function reset(): void {
  startX.value = 0; dragX.value = 0; isDragging.value = false
  axisLocked.value = null; validated.value = false
}
</script>

<template>
  <div
    class="relative h-full w-full"
    @touchstart.passive="onTouchStart"
    @touchmove="onTouchMove"
    @touchend.passive="onTouchEnd"
  >
    <!-- Page courante — translate pendant le drag, ombre de profondeur à gauche -->
    <div
      class="relative h-full w-full"
      :style="{
        transform: `translateX(${translateX}px)`,
        transition: (isDragging || validated)
          ? 'none'
          : 'transform 0.24s cubic-bezier(0.25,0.46,0.45,0.94)',
        willChange: isDragging ? 'transform' : 'auto',
        boxShadow: isDragging && translateX > 1
          ? `-5px 0 18px rgba(0,0,0,${0.3 + progress * 0.3}), -1px 0 0 rgba(255,255,255,0.04)`
          : 'none',
      }"
    >
      <slot />
    </div>

    <!-- Indicateur arc mauve→orange sur le bord gauche -->
    <div
      v-if="isDragging && progress > 0.05"
      class="pointer-events-none fixed z-[200]"
      :style="{
        top: '50%',
        left: '0px',
        transform: `translateY(-50%) translateX(${Math.max(0, translateX - 6)}px)`,
        opacity: Math.min(1, progress * 3),
        transition: 'none',
      }"
      aria-hidden="true"
    >
      <div
        class="w-[3px] rounded-full"
        :style="{
          height: `${38 + progress * 28}px`,
          background: 'linear-gradient(to bottom, #A78BFA, #F97316)',
          boxShadow: `0 0 ${8 + progress * 10}px rgba(167,139,250,0.8)`,
        }"
      />
    </div>
  </div>
</template>
