<script setup lang="ts">
import type { DocumentListItem } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'

interface Props {
  document: DocumentListItem
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [documentId: string]
}>()

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const visibleUserTags = computed(
  () => props.document.metadata?.userTags?.slice(0, 3) ?? []
)

const extraTagCount = computed(
  () => (props.document.metadata?.userTags?.length ?? 0) - visibleUserTags.value.length
)

const formattedDate = computed(() => {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(props.document.uploadedAt))
})

const displayedType = computed(() => {
  return props.document.metadata?.userOverrideType
    ?? props.document.intelligence?.detectedType
    ?? null
})
</script>

<template>
  <article
    class="card-base flex cursor-pointer items-start gap-3 p-4
           transition-all duration-200
           hover:border-tidy-border-strong hover:bg-white/[0.06]
           active:scale-[0.99]"
    :aria-label="`Document : ${document.title}`"
    role="button"
    tabindex="0"
    @click="emit('click', document.id)"
    @keydown.enter.prevent="emit('click', document.id)"
    @keydown.space.prevent="emit('click', document.id)"
  >
    <!-- Miniature / icône -->
    <ThumbnailPreview
      :thumbnail-url="document.thumbnailUrl"
      :mime-type="document.mimeType"
      size="md"
      :alt="`Aperçu de ${document.title}`"
    />

    <!-- Contenu principal -->
    <div class="min-w-0 flex-1">
      <!-- Ligne 1 : titre + badge statut -->
      <div class="flex items-start justify-between gap-2">
        <h3 class="line-clamp-2 text-sm font-semibold text-tidy-text-primary">
          {{ document.title }}
        </h3>
        <DocumentStatusBadge
          :status="document.processingStatus"
          class="flex-shrink-0"
        />
      </div>

      <!-- Ligne 2 : type détecté + taille + date -->
      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          v-if="displayedType"
          class="text-xs font-medium text-tidy-mauve"
        >
          {{ DETECTED_TYPE_LABELS[displayedType] }}
        </span>

        <span
          v-if="displayedType"
          class="text-tidy-text-tertiary"
          aria-hidden="true"
        >·</span>

        <span class="text-xs text-tidy-text-tertiary">
          {{ formatFileSize(document.fileSizeBytes) }}
        </span>

        <span class="text-tidy-text-tertiary" aria-hidden="true">·</span>

        <time
          :datetime="document.uploadedAt"
          class="text-xs text-tidy-text-tertiary"
        >
          {{ formattedDate }}
        </time>
      </div>

      <!-- Ligne 3 : tags utilisateur -->
      <div
        v-if="visibleUserTags.length > 0"
        class="mt-2 flex flex-wrap gap-1"
      >
        <TagChip
          v-for="tag in visibleUserTags"
          :key="tag"
          :label="tag"
          variant="user"
        />
        <span
          v-if="extraTagCount > 0"
          class="inline-flex items-center rounded-full border border-tidy-border-glass px-2 py-0.5 text-xs text-tidy-text-tertiary"
        >
          +{{ extraTagCount }}
        </span>
      </div>
    </div>
  </article>
</template>
