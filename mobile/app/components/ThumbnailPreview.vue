<script setup lang="ts">
interface Props {
  thumbnailUrl: string | null
  mimeType:     string
  size?:        'sm' | 'md' | 'lg'
  alt?:         string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  alt:  'Aperçu du document',
})

const hasError  = ref(false)
watch(() => props.thumbnailUrl, () => { hasError.value = false })
const showImage = computed(() => !!props.thumbnailUrl && !hasError.value)

// Conteneur
const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-10 w-10 rounded-2xl',
  md: 'h-14 w-14 rounded-2xl',
  lg: 'h-32 w-32 rounded-3xl',
}

// Icônes PNG — encore agrandies vs précédente version
const iconSizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-9 w-9',    // quasi plein conteneur
  md: 'h-12 w-12',  // quasi plein conteneur
  lg: 'h-24 w-24',  // quasi plein conteneur
}

const currentSizeClass     = computed(() => sizeClasses[props.size ?? 'md'])
const currentIconSizeClass = computed(() => iconSizeClasses[props.size ?? 'md'])

const iconSrc = computed(() =>
  (props.mimeType === 'image/jpeg' || props.mimeType === 'image/png')
    ? '/img/icon-picture.png'
    : '/img/icon-file.png'
)
</script>

<template>
  <div
    class="flex flex-shrink-0 items-center justify-center overflow-hidden bg-tidy-surface-glass border border-tidy-border-glass backdrop-blur-sm"
    :class="currentSizeClass"
  >
    <img v-if="showImage" :src="thumbnailUrl!" :alt="alt" class="h-full w-full object-cover" loading="lazy" @error="hasError = true" />
    <img v-else :src="iconSrc" :class="currentIconSizeClass" class="object-contain opacity-85" aria-hidden="true" alt="" />
  </div>
</template>
