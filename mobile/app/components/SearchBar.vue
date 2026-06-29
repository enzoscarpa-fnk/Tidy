<script setup lang="ts">
interface Props {
  initialQuery?: string
  placeholder?:  string
  autofocus?:    boolean
  fullWidth?:    boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
  placeholder:  'Rechercher un document, un montant, un fournisseur…',
  autofocus:    false,
  fullWidth:    false,
})

const emit = defineEmits<{
  search:  [query: string]
  clear:   []
  focused: [active: boolean]
}>()

const inputValue = ref(props.initialQuery)
const inputRef   = ref<HTMLInputElement | null>(null)
const isFocused  = ref(false)

onMounted(() => {
  if (props.autofocus) nextTick(() => inputRef.value?.focus())
})

function handleFocus(): void  { isFocused.value = true;  emit('focused', true) }
function handleBlur(): void   { isFocused.value = false; emit('focused', false) }

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
  if (event.key === 'Enter')  { event.preventDefault(); handleSubmit() }
  if (event.key === 'Escape') inputRef.value?.blur()
}
</script>

<template>
  <div class="relative flex items-center w-full">
    <input
      ref="inputRef"
      v-model="inputValue"
      type="search"
      :placeholder="placeholder"
      class="w-full text-sm pl-5 pr-20 py-3 rounded-full
             transition-all duration-200 focus:outline-none"
      :class="[
        isFocused
          ? 'border-tidy-mauve/60 ring-2 ring-tidy-mauve/20'
          : 'border-white/20',
      ]"
      style="
        background-color: rgba(19,19,31,0.92);
        border-width: 1px;
        border-style: solid;
        color: #F1F0FF;
      "
      :style="{
        '--placeholder-color': '#8B8AA8',
      }"
      autocomplete="off"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown="handleKeydown"
    />

    <div class="absolute right-2 flex items-center gap-0.5">
      <Transition name="fade">
        <button
          v-if="inputValue.length > 0"
          type="button"
          aria-label="Effacer la recherche"
          class="p-1.5 rounded-full text-tidy-text-secondary hover:text-tidy-text-primary hover:bg-white/10 transition-colors"
          @click="handleClear"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </Transition>
      <button
        type="button"
        aria-label="Lancer la recherche"
        class="p-1.5 rounded-full text-tidy-mauve hover:text-tidy-mauve-light hover:bg-tidy-mauve/10 transition-colors"
        @click="handleSubmit"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
input[type='search']::-webkit-search-cancel-button { display: none; }
input::placeholder { color: #8B8AA8; opacity: 1; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }
</style>
