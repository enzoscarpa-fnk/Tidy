<script setup lang="ts">
// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  thumbnailUrl: string | null
  mimeType: string
  /** Taille du conteneur — utilisée dans DocumentCard (md) et DocumentDetail (lg) */
  size?: 'sm' | 'md' | 'lg'
  alt?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  alt: 'Aperçu du document',
})

// ── Image loading state ────────────────────────────────────────────────────
const hasError = ref(false)

// Reset l'erreur si thumbnailUrl change (ex : reprocessing terminé)
watch(() => props.thumbnailUrl, () => {
  hasError.value = false
})

// ── Computed ───────────────────────────────────────────────────────────────
const showImage = computed(() => !!props.thumbnailUrl && !hasError.value)

const sizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-10 w-10 rounded-lg',
  md: 'h-14 w-14 rounded-xl',
  lg: 'h-32 w-32 rounded-2xl',
}

const iconSizeClasses: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-14 w-14',
}

const currentSizeClass = computed(() => sizeClasses[props.size ?? 'md'])
const currentIconSizeClass = computed(() => iconSizeClasses[props.size ?? 'md'])
</script>

<template>
  <div
    class="flex flex-shrink-0 items-center justify-center overflow-hidden bg-tidy-surface-overlay"
    :class="currentSizeClass"
  >
    <!-- Miniature réelle -->
    <img
      v-if="showImage"
      :src="thumbnailUrl!"
      :alt="alt"
      class="h-full w-full object-cover"
      loading="lazy"
      @error="hasError = true"
    />

    <!-- Fallback : icône selon mimeType -->
    <template v-else>
      <!-- PDF -->
      <svg
        v-if="mimeType === 'application/pdf'"
        :class="currentIconSizeClass"
        class="text-red-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M7 18H17V16H7V18ZM7 14H17V12H7V14ZM5 22C4.45 22 3.979 21.804 3.587 21.413C3.196 21.021 3 20.55 3 20V4C3 3.45 3.196 2.979 3.587 2.587C3.979 2.196 4.45 2 5 2H15L21 8V20C21 20.55 20.804 21.021 20.413 21.413C20.021 21.804 19.55 22 19 22H5ZM14 9H19L14 4V9Z"
        />
      </svg>

      <!-- JPEG / PNG → icône image générique -->
      <svg
        v-else-if="mimeType === 'image/jpeg' || mimeType === 'image/png'"
        :class="currentIconSizeClass"
        class="text-tidy-primary/60"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M21 19V5C21 3.9 20.1 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19ZM8.5 13.5L11 16.51L14.5 12L19 18H5L8.5 13.5Z"
        />
      </svg>

      <!-- Fallback générique -->
      <svg
        v-else
        :class="currentIconSizeClass"
        class="text-tidy-text-tertiary"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z"
        />
      </svg>
    </template>
  </div>
</template>
