<script setup lang="ts">
interface Props {
  userTags:  string[]
  notes:     string | null
  editMode:  boolean
}

const props = defineProps<Props>()
const emit  = defineEmits<{ addTag: [tag: string]; removeTag: [tag: string]; updateNotes: [notes: string] }>()

const tagInput = ref('')

function submitTag(): void {
  const trimmed = tagInput.value.trim()
  if (!trimmed || props.userTags.includes(trimmed)) return
  emit('addTag', trimmed); tagInput.value = ''
}

function onTagInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') { event.preventDefault(); submitTag() }
}
</script>

<template>
  <section class="glass-panel p-4" aria-label="Vos informations">
    <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-tidy-text-secondary">Vos informations</p>

    <!-- Tags utilisateur -->
    <div class="mb-3">
      <p class="mb-2 text-xs text-tidy-text-secondary">Tags personnels</p>
      <div class="flex flex-wrap gap-1.5">
        <TagChip v-for="tag in userTags" :key="tag" :label="tag" variant="user" :removable="editMode" @remove="emit('removeTag', $event)" />
        <span v-if="userTags.length === 0 && !editMode" class="text-xs text-tidy-text-tertiary italic">Aucun tag personnel</span>
      </div>
      <div v-if="editMode" class="mt-2 flex gap-2">
        <input v-model="tagInput" type="text" placeholder="Nouveau tag…" maxlength="40"
               class="flex-1 rounded-full border border-tidy-border-glass bg-tidy-surface-glass backdrop-blur-sm
                 px-3 py-1.5 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary
                 focus:border-tidy-mauve focus:outline-none"
               @keydown="onTagInputKeydown" />
        <button type="button"
                class="rounded-full bg-tidy-mauve/20 border border-tidy-mauve/30 px-3 py-1.5
                 text-sm font-medium text-tidy-mauve active:opacity-80 disabled:opacity-40"
                :disabled="!tagInput.trim()" @click="submitTag">
          Ajouter
        </button>
      </div>
    </div>

    <!-- Notes -->
    <div>
      <p class="mb-2 text-xs text-tidy-text-secondary">Notes</p>
      <textarea v-if="editMode" :value="notes ?? ''" rows="3" placeholder="Ajoutez une note…"
                class="w-full resize-none rounded-2xl border border-tidy-border-glass bg-tidy-surface-glass backdrop-blur-sm
               px-3 py-2 text-sm text-tidy-text-primary placeholder:text-tidy-text-tertiary
               focus:border-tidy-mauve focus:outline-none"
                @input="emit('updateNotes', ($event.target as HTMLTextAreaElement).value)" />
      <p v-else class="text-sm text-tidy-text-primary">{{ notes || '—' }}</p>
    </div>
  </section>
</template>
