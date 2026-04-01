<script setup lang="ts">
interface Props {
  initialQuery?: string
  placeholder?: string
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
  placeholder: 'Rechercher un document, un montant, un fournisseur…',
  autofocus: false,
})

const emit = defineEmits<{
  search: [query: string]
  clear: []
}>()

const inputValue = ref(props.initialQuery)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (props.autofocus) {
    nextTick(() => inputRef.value?.focus())
  }
})

// ── Règle critique : PAS de recherche live (UX Flow §6) ──────────────────
// La recherche est déclenchée UNIQUEMENT à la soumission (Enter ou icône loupe).

function handleSubmit(): void {
  const trimmed = inputValue.value.trim()
  if (!trimmed) return
  emit('search', trimmed)
}

function handleClear(): void {
  inputValue.value = ''
  emit('clear')
  nextTick(() => inputRef.value?.focus())
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    handleSubmit()
  }
}
</script>

<template>
  <div class="relative flex items-center w-full">
    <input
      ref="inputRef"
      v-model="inputValue"
      type="search"
      :placeholder="placeholder"
      class="w-full pl-4 pr-20 py-3 rounded-xl bg-tidy-surface border border-tidy-border
             text-tidy-text-primary placeholder:text-tidy-text-secondary text-sm
             focus:outline-none focus:ring-2 focus:ring-tidy-primary/40 transition-shadow"
      autocomplete="off"
      @keydown="handleKeydown"
    />

    <div class="absolute right-2 flex items-center gap-0.5">
      <!-- Bouton effacer — visible uniquement si texte présent -->
      <Transition name="fade">
        <button
          v-if="inputValue.length > 0"
          type="button"
          aria-label="Effacer la recherche"
          class="p-1.5 rounded-lg text-tidy-text-secondary hover:text-tidy-text-primary
                 hover:bg-tidy-border/50 transition-colors"
          @click="handleClear"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </Transition>

      <!-- Bouton loupe — toujours visible -->
      <button
        type="button"
        aria-label="Lancer la recherche"
        class="p-1.5 rounded-lg text-tidy-primary hover:text-tidy-primary/70
               hover:bg-tidy-primary/10 transition-colors"
        @click="handleSubmit"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Masque la croix native des inputs type="search" */
input[type='search']::-webkit-search-cancel-button {
  display: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
