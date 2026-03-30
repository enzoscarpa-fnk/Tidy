<script setup lang="ts">
// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  label: string
  /**
   * 'user'      → tag posé par l'utilisateur — fond blanc, bordure neutre
   * 'suggested' → tag suggéré par l'IA     — fond coloré, icône IA discrète
   */
  variant?: 'user' | 'suggested'
  /** Affiche le bouton de suppression × */
  removable?: boolean
  /** Désactive le bouton de suppression (ex : pendant une mutation) */
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'user',
  removable: false,
  disabled: false,
})

// ── Emits ──────────────────────────────────────────────────────────────────
const emit = defineEmits<{
  remove: [label: string]
}>()

// ── Computed ───────────────────────────────────────────────────────────────
const baseClasses = computed(() =>
  props.variant === 'suggested'
    ? 'bg-tidy-primary/10 text-tidy-primary border-transparent'
    : 'bg-white text-tidy-text-primary border-tidy-border'
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
    :class="baseClasses"
  >
    <!-- Icône IA pour les tags suggérés -->
    <svg
      v-if="variant === 'suggested'"
      class="h-3 w-3 flex-shrink-0 opacity-70"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Suggéré par l'IA"
    >
      <path
        d="M8 1a.5.5 0 0 1 .45.28l1.57 3.18 3.51.51a.5.5 0 0 1 .28.85L11.3 8.26l.6 3.5a.5.5 0 0 1-.73.53L8 10.56l-3.14 1.73a.5.5 0 0 1-.73-.53l.6-3.5L2.19 5.82a.5.5 0 0 1 .28-.85l3.51-.51L7.55 1.28A.5.5 0 0 1 8 1z"
      />
    </svg>

    <span class="max-w-[120px] truncate">{{ label }}</span>

    <!-- Bouton suppression -->
    <button
      v-if="removable"
      type="button"
      class="-mr-0.5 ml-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40"
      :disabled="disabled"
      :aria-label="`Supprimer le tag ${label}`"
      @click.stop="emit('remove', label)"
    >
      <svg
        class="h-2.5 w-2.5"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
        />
      </svg>
    </button>
  </span>
</template>
