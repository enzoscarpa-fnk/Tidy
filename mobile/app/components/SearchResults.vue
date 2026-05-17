<script setup lang="ts">
import type { DetectedType } from '~/types/api'
import { DETECTED_TYPE_LABELS } from '~/types/api'
import type { SearchFilters, SearchResultItem } from '~/stores/search'

interface Props {
  workspaceId: string
  initialQuery?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
})

const router = useRouter()
const searchStore = useSearchStore()

// ── Filtres disponibles dérivés des résultats courants ────────────────────

const availableTypes = computed<DetectedType[]>(
  () => Object.keys(DETECTED_TYPE_LABELS) as DetectedType[]
)

const availableTags = computed<string[]>(() => {
  const tags = new Set<string>()
  searchStore.results.forEach((r) =>
    r.metadata?.userTags?.forEach((t) => tags.add(t))
  )
  return Array.from(tags).sort()
})

// ── Lifecycle ────────────────────────────────────────────────────────────

onMounted(async () => {
  if (props.initialQuery.trim()) {
    await searchStore.search(props.workspaceId, props.initialQuery)
  }
})

onUnmounted(() => {
  // Nettoyage optionnel — la page search réinitialise si on revient au Dashboard
})

// ── Handlers ────────────────────────────────────────────────────────────

async function handleSearch(query: string): Promise<void> {
  await searchStore.search(props.workspaceId, query)
}

async function handleClear(): Promise<void> {
  searchStore.clearSearch()
}

async function handleFilterChange(newFilters: SearchFilters): Promise<void> {
  await searchStore.search(props.workspaceId, searchStore.query, newFilters)
}

async function handleClearAllFilters(): Promise<void> {
  searchStore.clearFilters()
  if (searchStore.query.trim()) {
    await searchStore.search(props.workspaceId, searchStore.query, {
      types: [],
      tags: [],
      dateRange: null,
    })
  }
}

function handleDocumentClick(item: SearchResultItem): void {
  router.push(
    `/workspace/${props.workspaceId}/document/${item.id}`
  )
}
</script>

<template>
  <div class="flex flex-col h-full">

    <!-- Header : barre de recherche -->
    <div class="px-4 pt-4 pb-2 bg-white border-b border-tidy-border">
      <SearchBar
        :initial-query="searchStore.query || initialQuery"
        autofocus
        @search="handleSearch"
        @clear="handleClear"
      />
    </div>

    <!-- Filtres -->
    <div
      v-if="searchStore.hasSearched"
      class="bg-white border-b border-tidy-border"
    >
      <TagFilterBar
        :available-types="availableTypes"
        :available-tags="availableTags"
        :active-filters="searchStore.filters"
        @filter-change="handleFilterChange"
        @clear-all="handleClearAllFilters"
      />
    </div>

    <!-- Contenu principal -->
    <div class="flex-1 overflow-y-auto">

      <!-- Chargement -->
      <div v-if="searchStore.isLoading" class="px-4 pt-4">
        <SkeletonLoader variant="search-result" :count="4" />
      </div>

      <!-- Erreur -->
      <div v-else-if="searchStore.error" class="px-4 pt-8">
        <ErrorState context="list-load" :retryable="true" @retry="handleSearch(searchStore.query)" />
      </div>

      <!-- État vide — aucune recherche lancée -->
      <div
        v-else-if="!searchStore.hasSearched"
        class="flex flex-col items-center justify-center px-4 pt-16 text-center"
      >
        <p class="text-tidy-text-secondary text-sm">
          Tapez un terme et appuyez sur Entrée pour lancer la recherche.
        </p>
      </div>

      <!-- État vide — recherche sans résultats -->
      <div
        v-else-if="searchStore.hasSearched && searchStore.results.length === 0"
        class="px-4 pt-8"
      >
        <EmptyState
          context="search"
          :query="searchStore.query"
          @primary-action="handleClearAllFilters"
        />
      </div>

      <!-- Résultats -->
      <div v-else class="px-4 pt-4 pb-6 flex flex-col gap-3">

        <!-- Compteur de résultats -->
        <p class="text-xs text-tidy-text-secondary">
          {{ searchStore.resultCount }}
          {{ searchStore.resultCount > 1 ? 'résultats' : 'résultat' }}
          pour
          <span class="font-medium text-tidy-text-primary">«&nbsp;{{ searchStore.query }}&nbsp;»</span>
        </p>

        <!-- Cartes de résultats -->
        <article
          v-for="item in searchStore.results"
          :key="item.id"
          class="card-base cursor-pointer hover:shadow-md transition-shadow"
          @click="handleDocumentClick(item)"
        >
          <div class="flex items-start gap-3 p-3">

            <!-- Miniature -->
            <ThumbnailPreview
              :thumbnail-url="item.thumbnailUrl"
              :mime-type="item.mimeType"
              class="shrink-0 w-12 h-12 rounded-lg"
            />

            <!-- Contenu -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="text-sm font-semibold text-tidy-text-primary truncate">
                  {{ item.title }}
                </h3>
                <DocumentStatusBadge :status="item.processingStatus" />
              </div>

              <!-- Extrait surligné (ts_headline de PostgreSQL) ──────────────
                   La source est notre backend : les balises <b> sont générées
                   par ts_headline — pas de risque XSS tiers.
              -->
              <p
                v-if="item.headline"
                class="text-xs text-tidy-text-secondary line-clamp-2 leading-relaxed [&_b]:font-semibold [&_b]:text-tidy-primary"
                v-html="item.headline"
              />
              <p v-else class="text-xs text-tidy-text-secondary truncate">
                {{ item.originalFilename }}
              </p>

              <!-- Tags -->
              <div
                v-if="item.metadata?.userTags?.length"
                class="flex flex-wrap gap-1 mt-2"
              >
                <TagChip
                  v-for="tag in item.metadata.userTags.slice(0, 3)"
                  :key="tag"
                  :label="tag"
                  variant="user"
                />
              </div>
            </div>

          </div>
        </article>

      </div>
    </div>
  </div>
</template>
