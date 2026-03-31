<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'

interface Props {
  currentDetectedType: DetectedType | null
  currentOverrideType: DetectedType | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ override: [type: DetectedType] }>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// Règle R6 : labels toujours en français — jamais les valeurs enum brutes dans le template
const ALL_TYPES: DetectedType[] = [
  'INVOICE',
  'CONTRACT',
  'RECEIPT',
  'ID_DOCUMENT',
  'BANK_STATEMENT',
  'OTHER',
]

const activeType = computed(
  () => props.currentOverrideType ?? props.currentDetectedType
)

const activeLabel = computed(() =>
  activeType.value ? DETECTED_TYPE_LABELS[activeType.value] : 'Sélectionner un type'
)

function select(type: DetectedType): void {
  emit('override', type)
  isOpen.value = false
}

function toggle(): void {
  isOpen.value = !isOpen.value
}

// Fermeture au clic extérieur (VueUse — auto-importé par Nuxt)
onClickOutside(dropdownRef, () => {
  isOpen.value = false
})

// Fermeture à la touche Escape
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') isOpen.value = false
}
</script>

<template>
  <div ref="dropdownRef" class="relative" @keydown="onKeydown">
    <!-- Bouton déclencheur -->
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-xl border border-tidy-border bg-white px-4 py-3 text-sm text-tidy-text-primary transition-colors hover:border-tidy-primary focus:border-tidy-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-tidy-primary"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-label="`Type de document — actuellement : ${activeLabel}`"
      @click="toggle"
    >
      <span :class="{ 'text-tidy-text-secondary': !activeType }">
        {{ activeLabel }}
      </span>
      <svg
        class="h-4 w-4 flex-shrink-0 text-tidy-text-secondary transition-transform duration-150"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>

    <!-- Liste déroulante -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <ul
        v-if="isOpen"
        role="listbox"
        :aria-label="`Sélectionner le type — actuellement : ${activeLabel}`"
        class="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-tidy-border bg-white shadow-lg"
      >
        <li
          v-for="type in ALL_TYPES"
          :key="type"
          role="option"
          :aria-selected="activeType === type"
          class="flex cursor-pointer items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-tidy-surface active:bg-tidy-primary/10"
          :class="{
            'font-semibold text-tidy-primary': activeType === type,
            'text-tidy-text-primary': activeType !== type,
          }"
          @click="select(type)"
        >
          <!-- Label UX — jamais la valeur enum brute (Règle R6) -->
          {{ DETECTED_TYPE_LABELS[type] }}

          <!-- Coche sur l'option active -->
          <svg
            v-if="activeType === type"
            class="h-4 w-4 flex-shrink-0 text-tidy-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M5 13l4 4L19 7"
            />
          </svg>

          <!-- Indicateur "détection IA originale" -->
          <span
            v-else-if="type === props.currentDetectedType && !props.currentOverrideType"
            class="text-xs text-tidy-text-secondary"
          >
            Détecté
          </span>
        </li>
      </ul>
    </Transition>
  </div>
</template>
