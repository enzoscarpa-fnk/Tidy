<script setup lang="ts">
import type { ShareExpiry } from '~/stores/share'
import { useShareStore } from '~/stores/share'

interface Props { documentId: string; modelValue: boolean }
const props = defineProps<Props>()
const emit  = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const shareStore      = useShareStore()
const selectedExpiry  = ref<ShareExpiry>('7d')
const copied          = ref(false)

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
  { value: '24h', label: '24 heures' },
  { value: '7d',  label: '7 jours' },
  { value: '30d', label: '30 jours' },
]

const activeLink = computed(() => shareStore.getShareLink(props.documentId))

function close(): void { emit('update:modelValue', false); copied.value = false }

async function handleGenerate(): Promise<void> { await shareStore.createShareLink(props.documentId, selectedExpiry.value) }

async function handleCopy(): Promise<void> {
  if (!activeLink.value?.shareUrl) return
  try { await navigator.clipboard.writeText(activeLink.value.shareUrl); copied.value = true; setTimeout(() => { copied.value = false }, 2000) }
  catch { /* fallback */ }
}

async function handleRevoke(): Promise<void> {
  if (!activeLink.value) return
  await shareStore.revokeShareLink(activeLink.value.id, props.documentId)
}

async function handleNativeShare(): Promise<void> {
  if (!activeLink.value?.shareUrl) return
  try { const { Share } = await import('@capacitor/share'); await Share.share({ title: 'Partager ce document', url: activeLink.value.shareUrl, dialogTitle: 'Envoyer via…' }) }
  catch { /* annulé */ }
}

function formatExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
}

defineExpose({ close, handleNativeShare })
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition duration-200 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="modelValue" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60" @click.self="close">
        <Transition enter-active-class="transition duration-300 ease-out" enter-from-class="translate-y-full opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-full opacity-0">
          <div v-if="modelValue" class="w-full max-w-lg glass-panel rounded-t-3xl rounded-b-none p-6 pb-safe">

            <!-- Titre -->
            <div class="mb-5 flex items-center justify-between">
              <h2 class="text-base font-semibold text-tidy-text-primary">Partager ce document</h2>
              <button type="button"
                      class="flex h-8 w-8 items-center justify-center rounded-full text-tidy-text-secondary transition-colors hover:bg-white/10 active:opacity-70"
                      aria-label="Fermer" @click="close">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Lien actif -->
            <template v-if="activeLink">
              <div class="mb-4 flex items-center gap-2 rounded-2xl border border-tidy-border-glass bg-tidy-surface-glass px-4 py-3">
                <span class="min-w-0 flex-1 truncate text-sm text-tidy-text-primary">{{ activeLink.shareUrl }}</span>
                <button type="button"
                        class="flex-shrink-0 rounded-full bg-tidy-orange px-3 py-1.5 text-xs font-semibold text-white transition-opacity active:opacity-70"
                        @click="handleCopy">
                  {{ copied ? 'Copié ✓' : 'Copier' }}
                </button>
              </div>
              <p class="mb-4 text-xs text-tidy-text-secondary">Expire le {{ formatExpiry(activeLink.expiresAt) }}</p>

              <button type="button"
                      class="mb-3 flex w-full items-center justify-center gap-2 rounded-full border border-tidy-mauve/30 bg-tidy-mauve/10 px-4 py-3 text-sm font-medium text-tidy-mauve transition-colors hover:bg-tidy-mauve/20 active:opacity-70"
                      @click="handleNativeShare">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Envoyer via…
              </button>

              <button type="button"
                      class="flex w-full items-center justify-center gap-2 rounded-full border border-tidy-status-error/30 bg-tidy-status-error/10 px-4 py-3 text-sm font-medium text-tidy-status-error transition-colors hover:bg-tidy-status-error/20 active:opacity-70 disabled:opacity-40"
                      :disabled="shareStore.isLoading" @click="handleRevoke">
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {{ shareStore.isLoading ? 'Révocation…' : 'Révoquer le lien' }}
              </button>
            </template>

            <!-- Formulaire génération -->
            <template v-else>
              <p class="mb-3 text-sm text-tidy-text-secondary">Durée de validité du lien</p>
              <div class="mb-5 flex gap-2">
                <button v-for="option in EXPIRY_OPTIONS" :key="option.value" type="button"
                        class="flex-1 rounded-full border px-3 py-2 text-sm font-medium transition-colors active:opacity-70"
                        :class="selectedExpiry === option.value
                    ? 'border-tidy-orange/40 bg-tidy-orange/15 text-tidy-orange'
                    : 'border-tidy-border-glass bg-white/5 text-tidy-text-secondary hover:border-tidy-mauve/40'"
                        @click="selectedExpiry = option.value">
                  {{ option.label }}
                </button>
              </div>
              <p v-if="shareStore.error" class="mb-3 text-xs text-tidy-status-error">{{ shareStore.error }}</p>
              <button type="button" class="btn-primary" :disabled="shareStore.isLoading" @click="handleGenerate">
                <svg v-if="!shareStore.isLoading" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {{ shareStore.isLoading ? 'Génération…' : 'Générer le lien' }}
              </button>
            </template>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
