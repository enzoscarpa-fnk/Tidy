<script setup lang="ts">
interface Props {
  /** Nombre d'échecs consécutifs — adapte le message affiché */
  failureCount: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  retry: []
  keepWithoutAnalysis: []
}>()

const message = computed(() => {
  if (props.failureCount >= 3) {
    return "L'analyse a échoué plusieurs fois. Le document reste accessible mais sans enrichissement automatique."
  }
  return "L'analyse automatique n'a pas pu aboutir. Vous pouvez relancer une nouvelle tentative."
})
</script>

<template>
  <section
    class="rounded-2xl border border-amber-200 bg-amber-50 p-4"
    aria-label="Actions document en échec"
  >
    <!-- Icône + titre -->
    <div class="mb-2 flex items-center gap-2">
      <svg
        class="h-5 w-5 flex-shrink-0 text-amber-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p class="text-sm font-semibold text-amber-800">Analyse incomplète</p>
    </div>

    <p class="mb-4 text-sm text-amber-700">{{ message }}</p>

    <div class="flex flex-col gap-2">
      <!-- Bouton principal : relancer — masqué après 3 échecs -->
      <button
        v-if="failureCount < 3"
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 active:opacity-80"
        @click="emit('retry')"
      >
        <svg
          class="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Relancer l'analyse
      </button>

      <!-- Lien secondaire : conserver sans analyse -->
      <button
        type="button"
        class="w-full py-2 text-sm text-amber-700 underline underline-offset-2 active:opacity-60"
        @click="emit('keepWithoutAnalysis')"
      >
        Conserver sans analyse
      </button>
    </div>
  </section>
</template>
