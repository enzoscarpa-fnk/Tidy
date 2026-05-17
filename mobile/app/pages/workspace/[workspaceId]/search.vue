<script setup lang="ts">
definePageMeta({
  middleware: ['workspace'],
})

const route = useRoute()
const workspaceId = computed(() => route.params.workspaceId as string)
const initialQuery = computed(() => (route.query.query as string) ?? '')

const searchStore = useSearchStore()

onUnmounted(() => {
  searchStore.clearSearch()
})
</script>

<template>
  <div class="flex flex-col h-screen bg-white">
    <SearchResults
      :workspace-id="workspaceId"
      :initial-query="initialQuery"
    />
  </div>
</template>
