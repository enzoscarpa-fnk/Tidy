<script setup lang="ts">
interface Props {
  userTags: string[]
  notes: string | null
  /** false = affichage · true = formulaire actif */
  editMode: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  addTag: [tag: string]
  removeTag: [tag: string]
  updateNotes: [notes: string]
}>()

const tagInput = ref('')

function submitTag(): void {
  const trimmed = tagInput.value.trim()
  if (!trimmed || props.userTags.includes(trimmed)) return
  emit('addTag', trimmed)
  tagInput.value = ''
}

function onTagInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitTag()
  }
}
</script>

<template>
  <section class="rounded-2xl border border-tidy-border bg-white p-4" aria-label="Vos informations">
    <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">
      Vos informations
    </p>

    <!-- Tags utilisateur -->
    <div class="mb-3">
      <p class="mb-2 text-xs text-tidy-text-secondary">Tags personnels</p>
      <div class="flex flex-wrap gap-1.5">
        <!-- Règle R8 : variante 'user' pour distinguer des tags IA -->
        <TagChip
          v-for="tag in userTags"
          :key="tag"
          :label="tag"
          variant="user"
          :removable="editMode"
          @remove="emit('removeTag', $event)"
        />
        <span
          v-if="userTags.length === 0 && !editMode"
          class="text-xs text-tidy-text-secondary italic"
        >
          Aucun tag personnel
        </span>
      </div>

      <!-- Input nouveau tag — visible en editMode uniquement -->
      <div v-if="editMode" class="mt-2 flex gap-2">
        <input
          v-model="tagInput"
          type="text"
          placeholder="Nouveau tag…"
          maxlength="40"
          class="flex-1 rounded-lg border border-tidy-border bg-tidy-surface px-3 py-1.5 text-sm text-tidy-text-primary placeholder:text-tidy-text-secondary focus:border-tidy-primary focus:outline-none"
          @keydown="onTagInputKeydown"
        />
        <button
          type="button"
          class="rounded-lg bg-tidy-primary px-3 py-1.5 text-sm font-medium text-white active:opacity-80 disabled:opacity-40"
          :disabled="!tagInput.trim()"
          @click="submitTag"
        >
          Ajouter
        </button>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <p class="mb-2 text-xs text-tidy-text-secondary">Notes</p>
      <textarea
        v-if="editMode"
        :value="notes ?? ''"
        rows="3"
        placeholder="Ajoutez une note…"
        class="w-full resize-none rounded-lg border border-tidy-border bg-tidy-surface px-3 py-2 text-sm text-tidy-text-primary placeholder:text-tidy-text-secondary focus:border-tidy-primary focus:outline-none"
        @input="emit('updateNotes', ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-else class="text-sm text-tidy-text-primary">
        {{ notes || '—' }}
      </p>
    </div>
  </section>
</template>
