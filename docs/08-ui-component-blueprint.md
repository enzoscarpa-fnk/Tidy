# 08 — UI & Component Blueprint (Front-end)
**Application** : Tidy — Gestionnaire Documentaire Mobile
**Version** : 1.0 · MVP
**Base** : UX Flow v1.1 · API Contract v1.0 · TDD v1.0
**Dernière mise à jour** : Mars 2026

***

## 1. Architecture Globale Front-end

### 1.1 Conventions de code

| Critère | Règle |
|---|---|
| **Framework** | Vue 3 — exclusivement `<script setup lang="ts">` (Options API interdite) |
| **API** | Composition API uniquement |
| **Typage** | TypeScript strict (`strict: true` dans `tsconfig.json`) — pas de `any` |
| **Style de composant** | Single File Components `.vue` — template / script / style dans un seul fichier |
| **Nommage fichiers** | PascalCase pour les composants (`DocumentCard.vue`), kebab-case pour les pages Nuxt (`document-[id].vue`) |
| **Nommage composables** | Préfixe `use` + nom en camelCase (`useDocumentStore`, `useCamera`) |
| **Imports** | Auto-imports Nuxt activés pour composants et composables — pas d'import manuel répétitif |
| **Linting** | ESLint + `@nuxt/eslint` · Prettier pour le formatage |

### 1.2 Stack front-end

```
Nuxt 3 (mode SPA — ssr: false obligatoire pour Capacitor)
├── Vue 3 + Composition API + TypeScript
├── Pinia (state management)
├── Tailwind CSS v3 (styling)
├── @vueuse/core (composables utilitaires — useIntersectionObserver, useDebounce...)
├── @nuxtjs/tailwindcss
└── Capacitor (bridge natif iOS/Android)
```

**Pourquoi `ssr: false`** : Capacitor exécute l'app dans une WebView sans serveur. Le SSR de Nuxt est incompatible avec ce mode — toutes les pages sont rendues côté client. Configurer dans `nuxt.config.ts` :

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: false,
  app: {
    baseURL: '/',
  }
})
```

### 1.3 Stratégie CSS (Tailwind)

- **Approche utility-first** : pas de classes CSS custom sauf pour les animations spécifiques (pulsation statut document).
- **Design tokens** : définir dans `tailwind.config.ts` les couleurs sémantiques du produit (`tidy-primary`, `tidy-surface`, `tidy-border`…) pour une cohérence stricte avec la charte Tidy.
- **Composants réutilisables** : utiliser `@apply` dans des fichiers `.css` uniquement pour les patterns répétitifs (ex : `.badge-status`, `.card-base`). Ne pas créer de composant Vue pour un simple style.
- **Dark mode** : hors scope MVP — ne pas implémenter, ne pas anticiper.
- **Animations** : les états de chargement (skeleton, pulsation statut) utilisent les classes `animate-pulse` et `animate-spin` de Tailwind. Une seule animation custom à déclarer : `animate-status-pulse` (pulsation douce sur la pastille document en traitement).

***

## 2. Routing & Pages (`/pages`)

### 2.1 Configuration Nuxt Router

Nuxt file-system routing. L'arborescence `/pages` est la source de vérité des routes. Aucune route n'est déclarée manuellement dans une config séparée.

### 2.2 Table exhaustive des routes MVP

| Fichier Nuxt | Route générée | Acte UX Flow | Description |
|---|---|---|---|
| `pages/index.vue` | `/` | — | Redirect guard vers `/workspace/[id]` ou `/auth/login` |
| `pages/auth/login.vue` | `/auth/login` | Acte 1 (retour) | Formulaire de connexion |
| `pages/auth/register.vue` | `/auth/register` | Acte 1 | Inscription + création workspace |
| `pages/workspace/[workspaceId]/index.vue` | `/workspace/:id` | Acte 3 + Acte 2 (entry) | **Dashboard** — liste documents + polling |
| `pages/workspace/[workspaceId]/upload.vue` | `/workspace/:id/upload` | Acte 2 | Upload flow (dropzone + progression) |
| `pages/workspace/[workspaceId]/scan.vue` | `/workspace/:id/scan` | Acte 2 (mobile) | Scan caméra native (Capacitor) |
| `pages/workspace/[workspaceId]/document/[documentId]/index.vue` | `/workspace/:wId/document/:dId` | Acte 3 + Acte 4 | Document Detail View |
| `pages/workspace/[workspaceId]/document/[documentId]/edit.vue` | `/workspace/:wId/document/:dId/edit` | Acte 4 (édition) | Édition métadonnées |
| `pages/workspace/[workspaceId]/search.vue` | `/workspace/:id/search` | Acte 5 | Search Results View |
| `pages/profile/index.vue` | `/profile` | — | Profil utilisateur (displayName, tier) |

### 2.3 Middlewares de route

Deux middlewares Nuxt à déclarer dans `/middleware/` :

**`auth.global.ts`** (appliqué globalement) : vérifie la présence d'un `accessToken` valide dans `useAuthStore`. Redirige vers `/auth/login` si absent. Exclut les routes `/auth/*`.

**`workspace.ts`** (appliqué sur les routes `/workspace/[workspaceId]/*`) : vérifie que le `workspaceId` de l'URL correspond à un workspace appartenant à l'utilisateur courant (`useWorkspaceStore`). Redirige vers `/` si workspace introuvable ou non autorisé.

### 2.4 Page `index.vue` — Redirect Guard

```typescript
// pages/index.vue
<script setup lang="ts">
const authStore = useAuthStore()
const workspaceStore = useWorkspaceStore()

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    navigateTo('/auth/login')
    return
  }
  await workspaceStore.fetchWorkspaces()
  const defaultWorkspace = workspaceStore.workspaces[0]
  if (defaultWorkspace) {
    navigateTo(`/workspace/${defaultWorkspace.id}`)
  }
})
</script>
```

***

## 3. Arborescence des Composants (`/components`)

### 3.1 Règle de séparation Smart / Dumb

- **Smart Component** : connaît les stores Pinia et/ou appelle directement des composables d'API. Gère son propre état de chargement. Émet peu d'events vers le parent (il agit lui-même).
- **Dumb Component** : reçoit des `props`, émet des `events`, ne connaît aucun store. Testable en isolation totale. Réutilisable dans n'importe quel contexte.

**Règle absolue** : un Dumb Component ne doit **jamais** importer un store Pinia.

### 3.2 Smart Components

#### `DocumentList.vue`
**Rôle** : récupère la liste des documents depuis `useDocumentStore`, orchestre le polling, gère l'infinite scroll.

```typescript
// Props
// Aucune — récupère directement depuis useDocumentStore

// Events émis
// Aucun — navigue directement via useRouter

// Comportement
// - Démarre le polling au mount si des documents sont en traitement
// - Arrête le polling au unmount
// - Écoute useDocumentStore.documents (reactive)
// - Gère les états : loading (skeleton) / empty / error / liste
```

#### `UploadDropzone.vue` (Smart)
**Rôle** : orchestre l'upload — validation fichier, progression, redirection post-upload.

```typescript
// Props
interface Props {
  workspaceId: string
}

// Events émis
// Aucun — navigue vers le Dashboard après succès via useRouter

// Comportement
// - Valide le type MIME et la taille (50 Mo) côté client avant envoi
// - Délègue l'upload à useDocumentStore.uploadDocument()
// - Affiche la ProgressBar (composant Dumb) pendant l'envoi
// - Redirige vers /workspace/:id après succès
// - Affiche les messages d'erreur définis dans l'UX Flow (format non supporté, taille, réseau)
```

#### `DocumentDetail.vue` (Smart)
**Rôle** : charge le document complet depuis l'API, orchestre les sous-sections.

```typescript
// Props
interface Props {
  documentId: string
  workspaceId: string
}

// Events émis
// Aucun — actions (archive, retry) déléguées au store
```

#### `SearchResults.vue` (Smart)
**Rôle** : gère la requête de recherche et les filtres via `useSearchStore`.

```typescript
// Props
interface Props {
  workspaceId: string
  initialQuery?: string
}
// Events émis — Aucun
```

#### `WorkspaceSelector.vue` (Smart)
**Rôle** : affiche la liste des workspaces, permet la navigation inter-workspace.

```typescript
// Props — Aucune (lit depuis useWorkspaceStore)
// Events émis — Aucun (navigue directement)
```

***

### 3.3 Dumb Components

#### `DocumentCard.vue`
**Rôle** : représentation visuelle d'un document dans la liste.

```typescript
// Props
interface Props {
  document: DocumentListItem  // Type issu de l'API Contract GET /documents
}

// Type DocumentListItem
interface DocumentListItem {
  id: string
  title: string
  originalFilename: string
  mimeType: string
  processingStatus: ProcessingStatus
  thumbnailUrl: string | null
  intelligence: DocumentIntelligence | null
  meta DocumentMetadata | null
  uploadedAt: string
  updatedAt: string
}

// Events émis
const emit = defineEmits<{
  click: [documentId: string]
}>()

// Sous-composants utilisés
// - DocumentStatusBadge (pastille statut)
// - TagChip (tags utilisateur)
// - ThumbnailPreview (miniature ou icône fallback)
```

#### `DocumentStatusBadge.vue`
**Rôle** : traduit le `processingStatus` technique en label UX conforme à l'UX Flow.

```typescript
// Props
interface Props {
  status: ProcessingStatus
  // ProcessingStatus = 'UPLOADED' | 'PROCESSING' | 'PARTIALLY_ENRICHED' |
  //                    'CLASSIFIED_ONLY' | 'ENRICHED' | 'FAILED' |
  //                    'PENDING_RETRY' | 'ARCHIVED'
}

// Mapping statut → label UX (UX Flow §4)
const STATUS_LABELS: Record<ProcessingStatus, string> = {
  UPLOADED: 'Document reçu',
  PROCESSING: 'Analyse en cours…',
  PARTIALLY_ENRICHED: 'Analyse en cours…',
  CLASSIFIED_ONLY: 'Prêt',
  ENRICHED: 'Prêt',
  FAILED: 'Analyse incomplète',
  PENDING_RETRY: 'Nouvelle analyse en cours…',
  ARCHIVED: 'Archivé',
}

// Mapping statut → couleur Tailwind
const STATUS_COLORS: Record<ProcessingStatus, string> = {
  UPLOADED: 'bg-gray-100 text-gray-600',
  PROCESSING: 'bg-blue-100 text-blue-700 animate-status-pulse',
  PARTIALLY_ENRICHED: 'bg-blue-100 text-blue-700 animate-status-pulse',
  CLASSIFIED_ONLY: 'bg-green-100 text-green-700',
  ENRICHED: 'bg-green-100 text-green-700',
  FAILED: 'bg-amber-100 text-amber-700',
  PENDING_RETRY: 'bg-blue-100 text-blue-700 animate-status-pulse',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

// Events émis — Aucun (composant purement visuel)
```

> **Règle critique** : Les statuts `PARTIALLY_ENRICHED` et `CLASSIFIED_ONLY` ne doivent jamais apparaître en label direct dans l'interface. Ce composant est le seul endroit où la conversion technique → UX est autorisée (UX Flow §9 — Complexités Volontairement Masquées).

#### `TagChip.vue`
**Rôle** : affiche un tag unique, avec option de suppression.

```typescript
// Props
interface Props {
  label: string
  variant: 'user' | 'suggested'  // 'user' = fond blanc · 'suggested' = fond coloré + icône IA
  removable?: boolean             // false par défaut
}

// Events émis
const emit = defineEmits<{
  remove: [label: string]
}>()
```

#### `IntelligenceSection.vue`
**Rôle** : zone "Détecté automatiquement" — lecture seule, fond coloré, icône discrète.

```typescript
// Props
interface Props {
  intelligence: DocumentIntelligence
  userOverrideType: string | null  // Si override actif, afficher la détection originale en gris dessous
}

// Events émis
const emit = defineEmits<{
  addSuggestedTag: [tag: string]       // "Ajouter à mes tags"
  requestTypeOverride: []              // Clic sur "Ce n'est pas le bon type ?"
}>()

// Structure DocumentIntelligence (mirroir API Contract)
interface DocumentIntelligence {
  detectedType: DetectedType | null
  suggestedTags: string[]
  globalConfidenceScore: number | null
  extractedEntities: ExtractedEntity[]
}

// Règle : jamais écraser la donnée IA — ce composant est READ ONLY
// Si globalConfidenceScore < 0.6 → afficher "Détection incertaine — vérifiez"
// Ne jamais exposer le score brut dans le template
```

#### `UserMetadataSection.vue`
**Rôle** : zone "Vos informations" — entièrement éditable, fond blanc neutre.

```typescript
// Props
interface Props {
  userTags: string[]
  notes: string | null
  editMode: boolean  // false = affichage · true = formulaire actif
}

// Events émis
const emit = defineEmits<{
  addTag: [tag: string]
  removeTag: [tag: string]
  updateNotes: [notes: string]
}>()
```

#### `SearchBar.vue`
**Rôle** : champ de recherche persistant dans le header.

```typescript
// Props
interface Props {
  initialQuery?: string
  placeholder?: string  // défaut: "Rechercher un document, un montant, un fournisseur…"
}

// Events émis
const emit = defineEmits<{
  search: [query: string]   // Déclenché à la soumission (Enter ou icône loupe)
  clear: []
}>()

// Comportement : PAS de recherche live (UX Flow §6 — pas d'autocomplétion en MVP)
// La recherche est déclenchée uniquement à la soumission
```

#### `TagFilterBar.vue`
**Rôle** : filtres chips sur la Search Results View.

```typescript
// Props
interface Props {
  availableTypes: DetectedType[]
  availableTags: string[]
  activeFilters: SearchFilters
}

interface SearchFilters {
  types: DetectedType[]
  tags: string[]
  dateRange: 'month' | 'quarter' | 'year' | null
}

// Events émis
const emit = defineEmits<{
  filterChange: [filters: SearchFilters]
  clearAll: []
}>()
```

#### `EmptyState.vue`
**Rôle** : état vide conforme à la Règle 1 UX (jamais de page blanche sans invitation).

```typescript
// Props
interface Props {
  context: 'dashboard' | 'search' | 'search-empty-workspace'
  query?: string  // pour le contexte 'search' — affiche "Aucun résultat pour « [query] »"
}

// Events émis
const emit = defineEmits<{
  primaryAction: []  // CTA principal (ex: "Ajouter votre premier document")
}>()
```

#### `ErrorState.vue`
**Rôle** : état d'erreur conforme aux principes UX (déresponsabiliser, proposer une action).

```typescript
// Props
interface Props {
  context: 'list-load' | 'upload-network' | 'ocr-failed' | 'generic'
  retryable: boolean
}

// Events émis
const emit = defineEmits<{
  retry: []
}>()
```

#### `UploadProgressBar.vue`
**Rôle** : barre de progression linéaire — état purement frontend (UX Flow §3.2 règle critique).

```typescript
// Props
interface Props {
  progress: number     // 0–100
  filename: string
  status: 'uploading' | 'success' | 'error'
  errorMessage?: string
}

// Events émis
const emit = defineEmits<{
  retry: []
}>()

// Ce composant N'existe que dans la page /upload
// Il ne reflète JAMAIS un état documentaire dans la liste du Dashboard
```

#### `SkeletonLoader.vue`
**Rôle** : squelettes de chargement (UX Flow §3.1 — pas de spinner global).

```typescript
// Props
interface Props {
  variant: 'document-card' | 'document-detail' | 'search-result'
  count?: number  // Nombre de squelettes à afficher (défaut: 3)
}
```

#### `TypeOverrideDropdown.vue`
**Rôle** : menu déroulant pour corriger le type détecté (UX Flow §7).

```typescript
// Props
interface Props {
  currentDetectedType: DetectedType | null
  currentOverrideType: DetectedType | null
}

// Types disponibles (API Contract — enum detectedType)
type DetectedType = 'INVOICE' | 'CONTRACT' | 'RECEIPT' | 'ID_DOCUMENT' | 'BANK_STATEMENT' | 'OTHER'

// Labels UX correspondants (jamais les valeurs enum brutes dans le template)
const TYPE_LABELS: Record<DetectedType, string> = {
  INVOICE: 'Facture',
  CONTRACT: 'Contrat',
  RECEIPT: 'Reçu',
  ID_DOCUMENT: 'Identité',
  BANK_STATEMENT: 'Relevé bancaire',
  OTHER: 'Autre',
}

// Events émis
const emit = defineEmits<{
  override: [type: DetectedType]
}>()
```

#### `FailedDocumentActions.vue`
**Rôle** : actions disponibles pour un document en état FAILED (UX Flow §3.6).

```typescript
// Props
interface Props {
  failureCount: number  // Nombre d'échecs consécutifs — adapte le message
}

// Events émis
const emit = defineEmits<{
  retry: []
  keepWithoutAnalysis: []
}>()
```

***

### 3.4 Arborescence complète `/components`

```
/components
├── /document
│   ├── DocumentCard.vue              ← Dumb
│   ├── DocumentStatusBadge.vue       ← Dumb
│   ├── DocumentList.vue              ← Smart
│   ├── DocumentDetail.vue            ← Smart
│   ├── IntelligenceSection.vue       ← Dumb
│   ├── UserMetadataSection.vue       ← Dumb
│   ├── TypeOverrideDropdown.vue      ← Dumb
│   ├── FailedDocumentActions.vue     ← Dumb
│   └── ThumbnailPreview.vue          ← Dumb
├── /upload
│   ├── UploadDropzone.vue            ← Smart
│   ├── UploadProgressBar.vue         ← Dumb
│   └── ScanCameraButton.vue          ← Smart (Capacitor)
├── /search
│   ├── SearchBar.vue                 ← Dumb
│   ├── SearchResults.vue             ← Smart
│   └── TagFilterBar.vue              ← Dumb
├── /workspace
│   ├── WorkspaceSelector.vue         ← Smart
│   └── WorkspaceNameEditor.vue       ← Dumb (inline edit)
├── /ui
│   ├── TagChip.vue                   ← Dumb
│   ├── EmptyState.vue                ← Dumb
│   ├── ErrorState.vue                ← Dumb
│   ├── SkeletonLoader.vue            ← Dumb
│   ├── ToastNotification.vue         ← Dumb (messages toast)
│   └── AppHeader.vue                 ← Smart (contient SearchBar + WorkspaceSelector)
└── /layout
    └── BottomNavBar.vue              ← Dumb (navigation mobile — Dashboard / Scan / Profil)
```

***

## 4. Gestion de l'État (Pinia Stores)

### 4.1 `useAuthStore`

**Fichier** : `/stores/auth.ts`

```typescript
export const useAuthStore = defineStore('auth', () => {
  // State
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const user = ref<User | null>(null)
  const isLoading = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const userTier = computed(() => user.value?.tier ?? 'free')

  // Actions
  async function login(email: string, password: string): Promise<void>
  async function register(email: string, password: string, displayName: string): Promise<void>
  async function logout(): Promise<void>
  async function refreshAccessToken(): Promise<void>
    // Appelle POST /api/v1/auth/refresh
    // Met à jour accessToken + refreshToken
    // En cas d'échec (REFRESH_TOKEN_INVALID) → logout() + redirect /auth/login
  async function fetchProfile(): Promise<void>

  // Persistance
  // Utiliser useCapacitorSecureStorage() pour stocker refreshToken
  // (pas de localStorage — contrainte TDD §5)
})
```

### 4.2 `useWorkspaceStore`

**Fichier** : `/stores/workspace.ts`

```typescript
export const useWorkspaceStore = defineStore('workspace', () => {
  // State
  const workspaces = ref<Workspace[]>([])
  const currentWorkspaceId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const currentWorkspace = computed(() =>
    workspaces.value.find(w => w.id === currentWorkspaceId.value) ?? null
  )

  // Actions
  async function fetchWorkspaces(): Promise<void>
    // GET /api/v1/workspaces
  async function createWorkspace(name: string): Promise<Workspace>
    // POST /api/v1/workspaces
  async function renameWorkspace(id: string, name: string): Promise<void>
    // PATCH /api/v1/workspaces/:id
  function setCurrentWorkspace(id: string): void
})
```

### 4.3 `useDocumentStore` — avec Polling Silencieux

**Fichier** : `/stores/document.ts`

### Type local SQLite (`LocalDocument`)

Le store manipule un type `LocalDocument` qui reflète directement les colonnes de la table `documents` du TDD §3.1. Un mapper le convertit en `DocumentListItem` pour les composants.

> **Note d'adaptation schema** : le DDL TDD §3.1 ne contient pas de colonne `workspace_id`. Pour supporter le multi-workspace, la colonne `workspace_id TEXT NOT NULL DEFAULT ''` est ajoutée lors de la migration v1 (à refléter dans le `MIGRATIONS` runner du TDD §3.2).

```typescript
// /types/local-document.ts

export interface LocalDocument {
  id: string                   // UUID v4, généré côté client
  workspace_id: string         // Ajout par rapport au DDL TDD — voir note ci-dessus
  local_file_path: string
  thumbnail_path: string | null
  original_filename: string
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png'
  file_size_bytes: number
  tag: LocalTag
  ocr_text: string | null
  ocr_status: LocalOcrStatus
  ocr_error_message: string | null
  ocr_confidence: number | null
  sync_status: LocalSyncStatus
  sync_error_message: string | null
  cloud_key: string | null
  is_deleted: 0 | 1
  created_at: number           // Unix ms
  updated_at: number           // Unix ms
  synced_at: number | null     // Unix ms
}

export type LocalTag =
  | 'Contrat' | 'Facture' | 'Identité' | 'Administratif'
  | 'Bancaire' | 'Fiscal' | 'Reçu' | 'Autre'

export type LocalOcrStatus = 'pending' | 'processing' | 'done' | 'error'
export type LocalSyncStatus = 'pending' | 'synced' | 'error'

// Mapper local → UI (utilisé dans le store, jamais dans les composants)
export function mapLocalToListItem(doc: LocalDocument): DocumentListItem {
  return {
    id: doc.id,
    workspaceId: doc.workspace_id,
    title: doc.original_filename.replace(/\.[^.]+$/, ''),
    originalFilename: doc.original_filename,
    mimeType: doc.mime_type,
    fileSizeBytes: doc.file_size_bytes,
    processingStatus: _deriveProcessingStatus(doc),
    thumbnailUrl: doc.thumbnail_path
      ? `capacitor://localhost/_capacitor_file_${doc.thumbnail_path}`
      : null,
    intelligence: null,   // Rempli séparément si ocr_status='done'
    meta {
      userTags: doc.tag !== 'Autre' ? [doc.tag] : [],
      notes: null,
      userOverrideType: null,
      lastEditedAt: null,
    },
    uploadedAt: new Date(doc.created_at).toISOString(),
    updatedAt: new Date(doc.updated_at).toISOString(),
  }
}

// Dérive le processingStatus UX depuis les champs locaux
function _deriveProcessingStatus(doc: LocalDocument): ProcessingStatus {
  if (doc.ocr_status === 'pending' || doc.ocr_status === 'processing') return 'PROCESSING'
  if (doc.ocr_status === 'done') return 'ENRICHED'
  if (doc.ocr_status === 'error') return 'FAILED'
  return 'UPLOADED'
}
```

### Store complet

```typescript
// /stores/document.ts
export const useDocumentStore = defineStore('document', () => {
  const db = useDatabase()

  // ── State ────────────────────────────────────────────────────────────────
  const documents = ref<DocumentListItem[]>([])
  const currentDocument = ref<DocumentListItem | null>(null)
  const isLoadingList = ref(false)          // true UNIQUEMENT au chargement initial
  const isLoadingDetail = ref(false)
  const listError = ref<string | null>(null)
  const uploadProgress = ref(0)
  const uploadStatus = ref<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const uploadError = ref<string | null>(null)

  // ── POLLING SILENCIEUX SUR SQLite ─────────────────────────────────────────
  // Interroge la base LOCALE toutes les 5 secondes.
  // Aucun appel réseau ici. Le SyncService met à jour SQLite en arrière-plan ;
  // ce poll détecte les changements et met à jour l'état réactif.
  // (UX Flow §5 — "Polling silencieux toutes les 5 secondes si Dashboard ouvert")

  let _pollingInterval: ReturnType<typeof setInterval> | null = null

  const PENDING_OCR_STATUSES: LocalOcrStatus[] = ['pending', 'processing']

  const hasDocumentsPendingOcr = computed(() =>
    documents.value.some(d => {
      const status = d.processingStatus
      return status === 'PROCESSING' || status === 'UPLOADED' || status === 'PENDING_RETRY'
    })
  )

  function startPolling(workspaceId: string): void {
    if (_pollingInterval) return
    _pollingInterval = setInterval(async () => {
      if (!hasDocumentsPendingOcr.value) {
        stopPolling()
        return
      }
      await _pollLocalDatabase(workspaceId)
    }, 5000)
  }

  function stopPolling(): void {
    if (_pollingInterval) {
      clearInterval(_pollingInterval)
      _pollingInterval = null
    }
  }

  async function _pollLocalDatabase(workspaceId: string): Promise<void> {
    // Lit depuis SQLite — pas de réseau, < 1ms sur device mid-range
    // Ne mute JAMAIS isLoadingList (UX Flow §5 — pas d'interruption)
    try {
      const freshRows = await db.getDocumentsByWorkspace(workspaceId, {
        includeDeleted: false,
        limit: 100,
      })
      _patchDocuments(freshRows.map(mapLocalToListItem))
    } catch {
      // Erreur silencieuse — le poll SQLite ne doit jamais alerter l'UI
    }
  }

  function _patchDocuments(freshList: DocumentListItem[]): void {
    // Patch ciblé sur les documents dont le processingStatus a changé
    // Ne retire jamais un document de la liste via le poll
    freshList.forEach(freshDoc => {
      const idx = documents.value.findIndex(d => d.id === freshDoc.id)
      if (idx === -1) {
        documents.value.unshift(freshDoc)
      } else if (documents.value[idx].processingStatus !== freshDoc.processingStatus) {
        documents.value[idx] = freshDoc   // Réactivité Vue ciblée
      }
    })
  }

  // Appelé par useSyncService après chaque cycle de sync réussi
  // pour forcer un rechargement complet depuis SQLite
  async function refreshFromDatabase(workspaceId: string): Promise<void> {
    const rows = await db.getDocumentsByWorkspace(workspaceId, { includeDeleted: false })
    documents.value = rows.map(mapLocalToListItem)
    if (hasDocumentsPendingOcr.value) startPolling(workspaceId)
  }

  // ── Actions CRUD — écrivent dans SQLite, jamais dans l'API directement ───

  async function loadDocuments(workspaceId: string): Promise<void> {
    // Chargement initial : lit SQLite → reactive state
    // L'API est appelée séparément par useSyncService (background)
    isLoadingList.value = true
    listError.value = null
    try {
      const rows = await db.getDocumentsByWorkspace(workspaceId, { includeDeleted: false })
      documents.value = rows.map(mapLocalToListItem)
      if (hasDocumentsPendingOcr.value) startPolling(workspaceId)
    } catch (e) {
      listError.value = 'Impossible de charger vos documents.'
    } finally {
      isLoadingList.value = false
    }
  }

  async function loadDocument(documentId: string): Promise<void> {
    isLoadingDetail.value = true
    try {
      const row = await db.getDocumentById(documentId)
      if (row) currentDocument.value = mapLocalToListItem(row)
    } finally {
      isLoadingDetail.value = false
    }
  }

  async function captureDocument(
    file: File | Blob,
    workspaceId: string,
    originalFilename: string,
    mimeType: LocalDocument['mime_type']
  ): Promise<string> {
    // Flux complet conforme TDD §6.1 — ÉTAPES 2 à 4

    // 1. Validation taille (TDD §4.3)
    if (file.size > 50 * 1024 * 1024) {
      throw new AppError('FILE_TOO_LARGE', `Fichier trop volumineux. Maximum : 50 Mo.`)
    }
    // 2. Génération UUID côté client (TDD §3.1 — id généré côté client)
    const documentId = crypto.randomUUID()
    const now = Date.now()

    // 3. Chiffrement + écriture filesystem (useFileSystem + useCrypto)
    const fileBuffer = await file.arrayBuffer()
    const fs = useFileSystem()
    const localPath = `tidy/files/${documentId}.${_extFromMime(mimeType)}`
    await fs.writeEncryptedFile(localPath, fileBuffer)

    // 4. Génération thumbnail (200x200, non chiffré — TDD §5.6)
    const thumbPath = await _generateThumbnail(fileBuffer, documentId, mimeType)

    // 5. INSERT dans SQLite — statut initial : ocr_status='pending', sync_status='pending'
    const localDoc: LocalDocument = {
      id: documentId,
      workspace_id: workspaceId,
      local_file_path: localPath,
      thumbnail_path: thumbPath,
      original_filename: originalFilename,
      mime_type: mimeType,
      file_size_bytes: file.size,
      tag: 'Autre',
      ocr_text: null,
      ocr_status: 'pending',
      ocr_error_message: null,
      ocr_confidence: null,
      sync_status: 'pending',
      sync_error_message: null,
      cloud_key: null,
      is_deleted: 0,
      created_at: now,
      updated_at: now,
      synced_at: null,
    }
    await db.insertDocument(localDoc)

    // 6. Ajout dans sync_log : opération 'upload' (TDD §3.1)
    await db.addSyncLogEntry({
      document_id: documentId,
      operation: 'upload',
      status: 'pending',
      created_at: now,
    })

    // 7. Le document apparaît immédiatement dans la liste locale
    documents.value.unshift(mapLocalToListItem(localDoc))
    startPolling(workspaceId)   // Démarre le poll si pas encore démarré

    // 8. Déclencher le SyncService en arrière-plan (non bloquant)
    // Le SyncService va appeler OCR + upload S3 + sync metadata
    const syncService = useSyncService()
    syncService.triggerAsync(workspaceId)   // fire-and-forget

    return documentId
  }

  async function updateMetadata(
    documentId: string,
    workspaceId: string,
    patch: { tag?: LocalTag; notes?: string | null }
  ): Promise<void> {
    const now = Date.now()
    // Optimistic update local
    await db.updateDocument(documentId, { ...patch, updated_at: now })

    // Ajout dans sync_log : opération 'update_meta'
    await db.addSyncLogEntry({
      document_id: documentId,
      operation: 'update_meta',
      status: 'pending',
      created_at: now,
    })

    // Patch de la liste réactive
    const idx = documents.value.findIndex(d => d.id === documentId)
    if (idx !== -1) {
      const updatedRow = await db.getDocumentById(documentId)
      if (updatedRow) documents.value[idx] = mapLocalToListItem(updatedRow)
    }

    useSyncService().triggerAsync(workspaceId)
  }

  async function softDeleteDocument(documentId: string, workspaceId: string): Promise<void> {
    await db.softDeleteDocument(documentId)
    // Retrait immédiat de la liste réactive
    documents.value = documents.value.filter(d => d.id !== documentId)
    useSyncService().triggerAsync(workspaceId)
  }

  async function retryOcr(documentId: string, workspaceId: string): Promise<void> {
    // Remet ocr_status='pending' localement → le SyncService reprend l'OCR
    await db.updateDocument(documentId, {
      ocr_status: 'pending',
      ocr_error_message: null,
      updated_at: Date.now(),
    })
    await refreshFromDatabase(workspaceId)
    startPolling(workspaceId)
    useSyncService().triggerAsync(workspaceId)
  }

  async function searchDocuments(workspaceId: string, query: string): Promise<DocumentListItem[]> {
    // Recherche FTS5 locale — fonctionne offline (NFR8)
    // Min 2 caractères (F2.3), insensible casse et accents (unicode61)
    if (query.trim().length < 2) return []
    const rows = await db.searchDocuments(workspaceId, query)
    return rows.map(mapLocalToListItem)
  }

  // ── Helpers privés ───────────────────────────────────────────────────────

  function _extFromMime(mime: LocalDocument['mime_type']): string {
    return { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[mime]
  }

  async function _generateThumbnail(
    buffer: ArrayBuffer,
    documentId: string,
    mimeType: LocalDocument['mime_type']
  ): Promise<string | null> {
    // Génère une miniature 200x200 JPEG (non chiffrée — TDD §5.6)
    // Implémentation via Canvas WebView (acceptable en MVP — TDD §2.3)
    // Retourne le chemin local ou null si échec non bloquant
    try {
      // ... logique canvas / pdf.js pour extraction première page
      const thumbPath = `tidy/thumbs/${documentId}_thumb.jpg`
      // writeFile non chiffré pour les thumbs (accès rapide pour la liste)
      return thumbPath
    } catch {
      return null   // Échec thumbnail = non bloquant
    }
  }

  return {
    // State
    documents, currentDocument, isLoadingList, isLoadingDetail,
    listError, uploadProgress, uploadStatus, uploadError,
    // Getters
    hasDocumentsPendingOcr,
    // Actions
    loadDocuments, loadDocument, captureDocument, updateMetadata,
    softDeleteDocument, retryOcr, searchDocuments,
    refreshFromDatabase, startPolling, stopPolling,
  }
})
```

### Cycle de vie du polling dans les pages (mis à jour)

```typescript
// pages/workspace/[workspaceId]/index.vue (Dashboard)
onMounted(async () => {
  // 1. Chargement instantané depuis SQLite (offline-ready dès ce point)
  await documentStore.loadDocuments(workspaceId)

  // 2. Sync background si réseau disponible (non bloquant)
  if (appStore.isOnline) {
    useSyncService().triggerAsync(workspaceId)
  }
  // Le polling SQLite est démarré par loadDocuments() si nécessaire
})

onUnmounted(() => {
  documentStore.stopPolling()
})
```

***

### 4.4 `useSearchStore`

**Fichier** : `/stores/search.ts`

```typescript
export const useSearchStore = defineStore('search', () => {
  // State
  const query = ref('')
  const filters = ref<SearchFilters>({
    types: [],
    tags: [],
    dateRange: null,
  })
  const results = ref<DocumentListItem[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const resultCount = ref(0)

  // Actions
  async function search(workspaceId: string): Promise<void>
    // GET /api/v1/documents?workspaceId=...&query=...&detectedType=...&userTags=...
    // Déclenché uniquement à la soumission (pas de debounce live — UX Flow §6)

  function clearFilters(): void
  function resetSearch(): void
})
```

### 4.5 `useAppStore`

**Fichier** : `/stores/app.ts`

```typescript
export const useAppStore = defineStore('app', () => {
  // State
  const isOnline = ref(true)
  const toasts = ref<Toast[]>([])

  // Actions
  function addToast(message: string, type: 'success' | 'info' | 'error', duration = 3000): void
  function removeToast(id: string): void

  // Initialisation réseau (via useNetwork Capacitor)
  function initNetworkListener(): void
    // @capacitor/network → Network.addListener('networkStatusChange', ...)
    // Met à jour isOnline
    // Si isOnline passe à true → déclencher documentStore.fetchDocuments() (sync reprise)
})
```

***

## 5. Intégration Capacitor (Services Locaux)

### 5.1 Composable `useCamera`

**Fichier** : `/composables/useCamera.ts`
**Plugin** : `@capacitor/camera`

```typescript
export function useCamera() {
  async function scanDocument(): Promise<CameraPhoto> {
    // Ouvre la caméra native
    // Photo.resultType = CameraResultType.Uri (chemin filesystem, pas base64 en mémoire)
    // Quality = 85 (TDD §6.1)
    // SaveToGallery = false (données privées)
    return await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
    })
  }

  return { scanDocument }
}
```

**Utilisation** : `ScanCameraButton.vue` → `UploadDropzone.vue` (transmission du fichier scanné au même flux d'upload standard).

### 5.2 Composable `useFileSystem`

**Fichier** : `/composables/useFileSystem.ts`
**Plugin** : `@capacitor/filesystem`

```typescript
export function useFileSystem() {

    async function writeEncryptedFile(path: string, plainBuffer: ArrayBuffer): Promise<void> {
        const crypto = useCrypto()
        const encryptedBuffer = await crypto.encryptFile(plainBuffer)
        const base64 = _bufferToBase64(encryptedBuffer)
        await Filesystem.writeFile({
            path,
            base64,
            directory: Directory.Library,
            recursive: true,
        })
    }

    async function readDecryptedFile(path: string): Promise<ArrayBuffer> {
        const raw = await readRawFile(path)           // Lit les bytes chiffrés
        const crypto = useCrypto()
        return await crypto.decryptFile(raw)           // Déchiffre uniquement ici
    }

    // Retourne le buffer chiffré tel qu'il est sur le filesystem
    // Utilisation exclusive : upload S3 (R20) — ne jamais passer ce buffer à l'UI
    async function readRawFile(path: string): Promise<ArrayBuffer> {
        const result = await Filesystem.readFile({
            path,
            directory: Directory.Library,
        })
        // Capacitor retourne les données en base64 string
        return _base64ToBuffer(result.data as string)
    }

    async function deleteFile(path: string): Promise<void> {
        await Filesystem.deleteFile({ path, directory: Directory.Library })
    }

    async function fileExists(path: string): Promise<boolean> {
        try {
            await Filesystem.stat({ path, directory: Directory.Library })
            return true
        } catch {
            return false
        }
    }

    async function getFileSize(path: string): Promise<number> {
        const stat = await Filesystem.stat({ path, directory: Directory.Library })
        return stat.size
    }

    function _bufferToBase64(buffer: ArrayBuffer): string {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    }

    function _base64ToBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
    }

    return {
        writeEncryptedFile,
        readDecryptedFile,
        readRawFile,        // ← exposé uniquement pour useSyncService
        deleteFile,
        fileExists,
        getFileSize,
    }
}
```

### 5.3 Composable `useCrypto`

**Fichier** : `/composables/useCrypto.ts`
**Plugin** : `@capacitor-community/secure-storage`

```typescript
export function useCrypto() {
  const KEY_ALIAS = 'tidy_doc_encryption_key'

  async function initEncryptionKey(): Promise<void>
    // Au premier lancement : génère clé AES-256 via crypto.getRandomValues
    // Stocke dans SecureStorage (iOS Keychain / Android Keystore)
    // TDD §5.1 — JAMAIS exécuté dans la WebView JS

  async function encryptFile(plainBuffer: ArrayBuffer): Promise<ArrayBuffer>
    // Lit la clé depuis SecureStorage
    // AES-256-GCM : génère IV 12 bytes aléatoires
    // Output : IV (12 bytes) || AuthTag (16 bytes) || Ciphertext — TDD §5.2

  async function decryptFile(encryptedBuffer: ArrayBuffer): Promise<ArrayBuffer>
    // Extrait IV (bytes 0–12) + AuthTag (bytes 12–28) + Ciphertext
    // Déchiffre AES-256-GCM
    // Si AuthTag invalide → throw AppError('DECRYPTION_FAILED') — TDD §5.3

  return { initEncryptionKey, encryptFile, decryptFile }
}
```

> **Contrainte non négociable** (TDD §2.1) : `encryptFile` et `decryptFile` doivent déléguer au plugin natif. Ne jamais utiliser la Web Crypto API (`SubtleCrypto`) du navigateur pour le chiffrement des fichiers stockés.

### 5.4 Composable `useNetwork`

**Fichier** : `/composables/useNetwork.ts`
**Plugin** : `@capacitor/network`

```typescript
export function useNetwork() {
    const isOnline = ref(true)
    const workspaceStore = useWorkspaceStore()

    async function init(): Promise<void> {
        const status = await Network.getStatus()
        isOnline.value = status.connected

        Network.addListener('networkStatusChange', async (status) => {
            isOnline.value = status.connected
            useAppStore().setOnline(status.connected)

            if (status.connected) {
                // Retour réseau → déclenche sync immédiatement (TDD §2.5)
                const wid = workspaceStore.currentWorkspaceId
                if (wid) useSyncService().triggerAsync(wid)
            }
            // Réseau perdu → aucune action nécessaire (SQLite reste disponible offline)
        })
    }

    return { isOnline, init }
}
```

### 5.5 Composable `useShareNative`

**Fichier** : `/composables/useShareNative.ts`
**Plugin** : `@capacitor/share`

```typescript
export function useShareNative() {
  async function shareLink(url: string, title?: string): Promise<void> {
    // Ouvre la share sheet native iOS / Android
    // Utilisé pour partager les liens temporaires de document (PRD §Flow 4)
    await Share.share({
      title: title ?? 'Partager ce document',
      url,
      dialogTitle: 'Envoyer via…',
    })
  }

  return { shareLink }
}
```

### 5.6 Composable `useAppLifecycle`

**Fichier** : `/composables/useAppLifecycle.ts`
**Plugin** : `@capacitor/app`

```typescript
export function useAppLifecycle() {
    function init(): void {
        App.addListener('appStateChange', async ({ isActive }) => {
            const documentStore = useDocumentStore()
            const workspaceStore = useWorkspaceStore()
            const wid = workspaceStore.currentWorkspaceId

            if (isActive) {
                // Foreground : reprend les opérations en suspens (TDD §2.5)
                // Vérifie les documents avec ocr_status='pending' et sync_status='pending'
                if (wid) {
                    documentStore.startPolling(wid)
                    if (useAppStore().isOnline) useSyncService().triggerAsync(wid)
                }
            } else {
                // Background : arrête le poll SQLite (économie batterie — TDD §2.5)
                documentStore.stopPolling()
                // Les opérations OCR en cours sont interrompues → ocr_status reste 'pending'
                // Reprises au prochain foreground (TDD §2.5 "App kill + redémarrage")
            }
        })
    }

    return { init }
}
```

### 5.7 Composable `useSecureStorage`

**Fichier** : `/composables/useSecureStorage.ts`
**Plugin** : `@capacitor-community/secure-storage`

```typescript
export function useSecureStorage() {
  async function setItem(key: string, value: string): Promise<void>
    // iOS Keychain / Android Keystore — jamais localStorage

  async function getItem(key: string): Promise<string | null>
  async function removeItem(key: string): Promise<void>

  return { setItem, getItem, removeItem }
}

// Utilisation principale : stockage du refreshToken JWT
// Clé : 'tidy_refresh_token'
// Ne jamais stocker dans un cookie ou localStorage (NFR4)
```

### 5.8 Composable `useTidyApi`

**Fichier** : `/composables/useTidyApi.ts`

```typescript
// Client HTTP centralisé — wrapping de $fetch Nuxt
export function useTidyApi() {
  const authStore = useAuthStore()

  const $tidyApi = $fetch.create({
    baseURL: useRuntimeConfig().public.apiBaseUrl, // https://api.tidy.io/api/v1
    onRequest({ options }) {
      if (authStore.accessToken) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${authStore.accessToken}`,
        }
      }
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        // Token expiré → tenter refresh automatique
        authStore.refreshAccessToken()
      }
    },
  })

  return { $tidyApi }
}
```

### 5.9 `useDatabase`

**Fichier** : `/composables/useDatabase.ts`
**Plugin** : `@capawesome/capacitor-sqlite`
**Rôle** : unique point d'accès à la base SQLite locale — aucun autre composable n'utilise directement le plugin SQLite.

```typescript
export function useDatabase() {
  // Singleton — la connexion est ouverte une fois au démarrage de l'app
  // via initDatabase() appelé dans le plugin Nuxt /plugins/database.client.ts
  const DB_NAME = 'tidy_local'

  // ── Initialisation ────────────────────────────────────────────────────────

  async function initDatabase(): Promise<void> {
    // 1. Récupère la clé de chiffrement depuis Secure Storage (Keychain/Keystore)
    //    (useCrypto.initEncryptionKey() doit avoir été appelé avant)
    const crypto = useCrypto()
    const encryptionKey = await crypto.getEncryptionKey()

    // 2. Ouvre la DB SQLite chiffrée (TDD §5.1 — même clé pour DB et fichiers)
    await CapacitorSQLite.open({
      database: DB_NAME,
      encrypted: true,
      mode: 'secret',
      secret: encryptionKey,
    })

    // 3. Exécute les migrations DDL (TDD §3.2)
    await _runMigrations()
  }

  async function _runMigrations(): Promise<void> {
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT value FROM app_state WHERE key = 'schema_version'`,
      values: [],
    })
    const currentVersion = result.values?.[0]?.value
      ? parseInt(result.values[0].value, 10)
      : 0
    const TARGET_VERSION = 1   // Incrémenter à chaque migration
    if (currentVersion >= TARGET_VERSION) return

    const MIGRATIONS: Record<number, string[]> = {
      1: [
        // DDL complet conforme TDD §3.1 + ajout workspace_id
        `CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL DEFAULT '',
          local_file_path TEXT NOT NULL,
          thumbnail_path TEXT,
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          tag TEXT NOT NULL DEFAULT 'Autre',
          ocr_text TEXT,
          ocr_status TEXT NOT NULL DEFAULT 'pending',
          ocr_error_message TEXT,
          ocr_confidence REAL,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          sync_error_message TEXT,
          cloud_key TEXT,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          synced_at INTEGER
        )`,
        `CREATE TABLE IF NOT EXISTS sync_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_attempt INTEGER,
          error_message TEXT,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS share_links (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at INTEGER NOT NULL,
          is_revoked INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
        // FTS5 — TDD §3.1
        `CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
          id UNINDEXED, original_filename, ocr_text, tag UNINDEXED,
          content='documents', content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 1'
        )`,
        // Triggers FTS5 — TDD §3.1
        `CREATE TRIGGER IF NOT EXISTS documents_fts_insert
         AFTER INSERT ON documents BEGIN
           INSERT INTO documents_fts(rowid, id, original_filename, ocr_text, tag)
           VALUES (new.rowid, new.id, new.original_filename, new.ocr_text, new.tag);
         END`,
        `CREATE TRIGGER IF NOT EXISTS documents_fts_update
         AFTER UPDATE ON documents BEGIN
           DELETE FROM documents_fts WHERE rowid = old.rowid;
           INSERT INTO documents_fts(rowid, id, original_filename, ocr_text, tag)
           VALUES (new.rowid, new.id, new.original_filename, new.ocr_text, new.tag);
         END`,
        `CREATE TRIGGER IF NOT EXISTS documents_fts_delete
         AFTER DELETE ON documents BEGIN
           DELETE FROM documents_fts WHERE rowid = old.rowid;
         END`,
        // Index — TDD §3.1
        `CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id) WHERE is_deleted = 0`,
        `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC) WHERE is_deleted = 0`,
        `CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON documents(ocr_status)`,
        `CREATE INDEX IF NOT EXISTS idx_documents_sync_status ON documents(sync_status) WHERE is_deleted = 0`,
        `CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status, document_id)`,
        // Valeurs initiales app_state
        `INSERT OR IGNORE INTO app_state VALUES ('schema_version', '0')`,
        `INSERT OR IGNORE INTO app_state VALUES ('last_sync_at', '0')`,
        `INSERT OR IGNORE INTO app_state VALUES ('user_tier', 'free')`,
      ],
    }

    for (let v = currentVersion + 1; v <= TARGET_VERSION; v++) {
      for (const sql of MIGRATIONS[v]) {
        await CapacitorSQLite.execute({ database: DB_NAME, statements: sql })
      }
    }
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE app_state SET value = ? WHERE key = 'schema_version'`,
      values: [String(TARGET_VERSION)],
    })
  }

  // ── Lectures ──────────────────────────────────────────────────────────────

  async function getDocumentsByWorkspace(
    workspaceId: string,
    options: { includeDeleted?: boolean; limit?: number; offset?: number } = {}
  ): Promise<LocalDocument[]> {
    const { includeDeleted = false, limit = 30, offset = 0 } = options
    const deletedClause = includeDeleted ? '' : 'AND is_deleted = 0'
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT * FROM documents
                  WHERE workspace_id = ? ${deletedClause}
                  ORDER BY created_at DESC
                  LIMIT ? OFFSET ?`,
      values: [workspaceId, limit, offset],
    })
    return (result.values ?? []) as LocalDocument[]
  }

  async function getDocumentById(id: string): Promise<LocalDocument | null> {
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT * FROM documents WHERE id = ? AND is_deleted = 0`,
      values: [id],
    })
    return (result.values?.[0] as LocalDocument) ?? null
  }

  async function searchDocuments(
    workspaceId: string,
    query: string
  ): Promise<LocalDocument[]> {
    // Requête FTS5 — résultats < 1 seconde sur index local (F2.2, NFR1)
    // La table documents_fts est scopée par workspace via JOIN
    // unicode61 gère accents et casse (F2.7)
    const ftsQuery = query.trim().split(/\s+/).map(w => `"${w}"*`).join(' ')
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT d.* FROM documents d
                  INNER JOIN documents_fts fts ON d.rowid = fts.rowid
                  WHERE documents_fts MATCH ?
                    AND d.workspace_id = ?
                    AND d.is_deleted = 0
                  ORDER BY rank`,
      values: [ftsQuery, workspaceId],
    })
    return (result.values ?? []) as LocalDocument[]
  }

  async function getPendingOcrDocuments(): Promise<LocalDocument[]> {
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT * FROM documents
                  WHERE ocr_status = 'pending' AND is_deleted = 0
                  ORDER BY created_at ASC`,
      values: [],
    })
    return (result.values ?? []) as LocalDocument[]
  }

  async function getPendingSyncLogEntries(): Promise<SyncLogEntry[]> {
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT sl.*, d.mime_type, d.original_filename, d.local_file_path,
                         d.tag, d.ocr_text, d.ocr_status, d.updated_at, d.workspace_id
                  FROM sync_log sl
                  JOIN documents d ON d.id = sl.document_id
                  WHERE sl.status = 'pending'
                    AND sl.attempt_count < 3
                  ORDER BY sl.created_at ASC`,
      values: [],
    })
    return (result.values ?? []) as SyncLogEntry[]
  }

  // ── Écritures ─────────────────────────────────────────────────────────────

  async function insertDocument(doc: LocalDocument): Promise<void> {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT INTO documents
        (id, workspace_id, local_file_path, thumbnail_path, original_filename,
         mime_type, file_size_bytes, tag, ocr_text, ocr_status, ocr_error_message,
         ocr_confidence, sync_status, sync_error_message, cloud_key,
         is_deleted, created_at, updated_at, synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      values: [
        doc.id, doc.workspace_id, doc.local_file_path, doc.thumbnail_path,
        doc.original_filename, doc.mime_type, doc.file_size_bytes, doc.tag,
        doc.ocr_text, doc.ocr_status, doc.ocr_error_message, doc.ocr_confidence,
        doc.sync_status, doc.sync_error_message, doc.cloud_key, doc.is_deleted,
        doc.created_at, doc.updated_at, doc.synced_at,
      ],
    })
    // Le trigger documents_fts_insert met à jour FTS5 automatiquement
  }

  async function updateDocument(id: string, patch: Partial<LocalDocument>): Promise<void> {
    // Génère dynamiquement les colonnes à mettre à jour
    const fields = Object.keys(patch)
    if (fields.length === 0) return
    const setClauses = fields.map(f => `${f} = ?`).join(', ')
    const values = [...Object.values(patch), id]
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE documents SET ${setClauses} WHERE id = ?`,
      values,
    })
    // Le trigger documents_fts_update met à jour FTS5 automatiquement
  }

  async function softDeleteDocument(id: string): Promise<void> {
    const now = Date.now()
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE documents SET is_deleted = 1, updated_at = ? WHERE id = ?`,
      values: [now, id],
    })
    await addSyncLogEntry({ document_id: id, operation: 'delete', status: 'pending', created_at: now })
  }

  async function upsertDocumentFromCloud(cloudDoc: CloudDocumentPayload): Promise<void> {
    // Pull sync — LWW : conserve la version la plus récente (TDD §7.5)
    const existing = await getDocumentById(cloudDoc.id)
    if (existing && existing.updated_at > cloudDoc.updated_at) {
      return  // Local plus récent → skip (LWW)
    }
    if (existing) {
      await updateDocument(cloudDoc.id, {
        tag: cloudDoc.tag as LocalTag,
        ocr_text: cloudDoc.ocr_text,
        ocr_status: cloudDoc.ocr_status as LocalOcrStatus,
        ocr_confidence: cloudDoc.ocr_confidence,
        cloud_key: cloudDoc.s3_key,
        sync_status: 'synced',
        updated_at: cloudDoc.updated_at,
        synced_at: Date.now(),
        is_deleted: cloudDoc.is_deleted ? 1 : 0,
      })
    }
    // Si le document n'existe pas localement (premier chargement multi-device) :
    // un INSERT complet nécessiterait le fichier local → hors scope MVP
    // (NFR11 — un document visible dans l'app est récupérable depuis le cloud)
  }

  async function addSyncLogEntry(entry: Omit<SyncLogEntry, 'id' | 'attempt_count' | 'last_attempt' | 'error_message'>): Promise<void> {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT INTO sync_log (document_id, operation, status, attempt_count, created_at)
                  VALUES (?, ?, ?, 0, ?)`,
      values: [entry.document_id, entry.operation, entry.status, entry.created_at],
    })
  }

  async function updateSyncLogEntry(id: number, status: 'done' | 'error' | 'in_progress', errorMessage?: string): Promise<void> {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `UPDATE sync_log
                  SET status = ?, last_attempt = ?, attempt_count = attempt_count + 1,
                      error_message = ?
                  WHERE id = ?`,
      values: [status, Date.now(), errorMessage ?? null, id],
    })
  }

  // ── app_state ─────────────────────────────────────────────────────────────

  async function getAppState(key: string): Promise<string | null> {
    const result = await CapacitorSQLite.query({
      database: DB_NAME,
      statement: `SELECT value FROM app_state WHERE key = ?`,
      values: [key],
    })
    return result.values?.[0]?.value ?? null
  }

  async function setAppState(key: string, value: string): Promise<void> {
    await CapacitorSQLite.run({
      database: DB_NAME,
      statement: `INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)`,
      values: [key, value],
    })
  }

  return {
    initDatabase,
    getDocumentsByWorkspace, getDocumentById, searchDocuments,
    getPendingOcrDocuments, getPendingSyncLogEntries,
    insertDocument, updateDocument, softDeleteDocument, upsertDocumentFromCloud,
    addSyncLogEntry, updateSyncLogEntry,
    getAppState, setAppState,
  }
}
```

### 5.10 `useSyncService`

**Fichier** : `/composables/useSyncService.ts`
**Rôle** : seul composable autorisé à appeler `$tidyApi`. Orchestre les 4 opérations de sync en arrière-plan sans bloquer l'UI. Le store est notifié via `refreshFromDatabase()` une fois la sync terminée.

```typescript
export function useSyncService() {
  const db = useDatabase()
  const { $tidyApi } = useTidyApi()
  const documentStore = useDocumentStore()
  let _isSyncing = false   // Verrou simple — évite les exécutions parallèles

  // Point d'entrée principal — fire-and-forget, appelé depuis le store et les lifecycle hooks
  function triggerAsync(workspaceId: string): void {
    if (_isSyncing) return
    syncAll(workspaceId).catch(() => {
      // Erreurs de sync = silencieuses pour l'utilisateur — loggées localement
      _isSyncing = false
    })
  }

  async function syncAll(workspaceId: string): Promise<void> {
    _isSyncing = true
    try {
      // Ordre d'exécution : pull d'abord (évite les conflits) → OCR → upload → push
      await pullFromCloud(workspaceId)
      await processOcrQueue()
      await uploadPendingFiles()
      await pushToCloud()
      // Notifier le store pour rafraîchir l'UI depuis SQLite
      await documentStore.refreshFromDatabase(workspaceId)
    } finally {
      _isSyncing = false
    }
  }

  // ── Pull : récupère les modifications cloud depuis la dernière sync ────────
  async function pullFromCloud(workspaceId: string): Promise<void> {
    const lastSyncAt = await db.getAppState('last_sync_at') ?? '0'
    try {
      const response = await $tidyApi<SyncPullResponse>(
        `/documents/sync?since=${lastSyncAt}&workspaceId=${workspaceId}`
      )
      // UPSERT chaque document reçu avec LWW (TDD §7.4 + §7.5)
      for (const cloudDoc of response.documents) {
        await db.upsertDocumentFromCloud(cloudDoc)
      }
      // Met à jour le timestamp de dernière sync (TDD §7.4)
      await db.setAppState('last_sync_at', String(response.server_timestamp))
    } catch {
      // Pull échoué = non bloquant — la version locale reste disponible (NFR9)
    }
  }

  // ── OCR : traite les documents avec ocr_status='pending' (TDD §6.1 ÉTAPE 3) ──
  async function processOcrQueue(): Promise<void> {
    const pendingDocs = await db.getPendingOcrDocuments()
    // Traitement séquentiel (TDD §2.6 — pas de parallélisme sur device ≤ 3 Go)
    for (const doc of pendingDocs) {
      await _processOcr(doc)
    }
  }

  async function _processOcr(doc: LocalDocument): Promise<void> {
    // Marque en processing avant l'appel API
    await db.updateDocument(doc.id, { ocr_status: 'processing', updated_at: Date.now() })
    try {
      // Lecture + déchiffrement du fichier local
      const fs = useFileSystem()
      const fileBuffer = await fs.readDecryptedFile(doc.local_file_path)
      const base64 = _bufferToBase64(fileBuffer)

      // Appel proxy OCR (TDD §6.2 — clé Mistral jamais dans l'app)
      const result = await _callOcrWithRetry({
        document_id: doc.id,
        file_base64: base64,
        mime_type: doc.mime_type,
      })

      // Mise à jour SQLite avec le résultat (TDD §6.1 ÉTAPE 4)
      // Le trigger FTS5 met à jour l'index automatiquement
      await db.updateDocument(doc.id, {
        ocr_text: result.ocr_text,
        ocr_confidence: result.confidence,
        ocr_status: 'done',
        updated_at: Date.now(),
      })
    } catch (e) {
      // Gestion des retry (TDD §6.3)
      const existing = await db.getDocumentById(doc.id)
      const attemptCount = (existing as any)?._ocr_attempt_count ?? 1
      if (attemptCount >= 3) {
        await db.updateDocument(doc.id, {
          ocr_status: 'error',
          ocr_error_message: e instanceof Error ? e.message : 'Erreur OCR',
          updated_at: Date.now(),
        })
      } else {
        // Remet en pending pour le prochain cycle
        await db.updateDocument(doc.id, { ocr_status: 'pending', updated_at: Date.now() })
      }
    }
  }

  async function _callOcrWithRetry(payload: OcrPayload): Promise<OcrResult> {
    // Backoff exponentiel : 2s, 8s, 32s (TDD §6.3)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await $tidyApi<OcrResult>('/ocr/process', {
          method: 'POST',
          body: payload,
          timeout: 15_000,
        })
      } catch (e) {
        if (attempt === 3) throw e
        if (_isNonRetryable(e)) throw e    // 400, 401, 402 — pas de retry
        await _sleep(Math.pow(4, attempt) * 500)
      }
    }
    throw new Error('OCR max retries reached')
  }

  // ── Upload fichiers : obtient presigned URL S3 et envoie le fichier ────────
  async function uploadPendingFiles(): Promise<void> {
    const pendingUploads = (await db.getPendingSyncLogEntries())
      .filter(e => e.operation === 'upload' && !e.cloud_key)
    for (const entry of pendingUploads) {
      await _uploadFile(entry)
    }
  }

    async function _uploadFile(entry: SyncLogEntry): Promise<void> {
        await db.updateSyncLogEntry(entry.id, 'in_progress')
        try {
            // 1. Demande une presigned URL S3 PUT (TDD §7.3)
            const { upload_url, s3_key } = await $tidyApi<UploadUrlResponse>('/files/upload-url', {
                method: 'POST',
                body: {
                    document_id: entry.document_id,
                    mime_type: entry.mime_type,
                    file_size_bytes: entry.file_size_bytes,
                },
            })

            // 2. Lit le fichier CHIFFRÉ tel quel — pas de déchiffrement (R20)
            //    Le buffer retourné est : IV (12 bytes) || AuthTag (16 bytes) || Ciphertext
            const fs = useFileSystem()
            const encryptedBuffer = await fs.readRawFile(entry.local_file_path)

            // 3. Upload direct S3 du fichier chiffré
            //    Content-Type intentionnellement générique : le contenu n'est pas lisible
            //    par S3 ou CloudFront — c'est un blob opaque chiffré côté client (TDD §9.3)
            await fetch(upload_url, {
                method: 'PUT',
                body: encryptedBuffer,
                headers: { 'Content-Type': 'application/octet-stream' },
            })

            // 4. Met à jour cloud_key localement
            await db.updateDocument(entry.document_id, {
                cloud_key: s3_key,
                sync_status: 'synced',
                synced_at: Date.now(),
                updated_at: Date.now(),
            })
            await db.updateSyncLogEntry(entry.id, 'done')

        } catch (e) {
            await db.updateSyncLogEntry(entry.id, 'error', e instanceof Error ? e.message : 'Upload error')
            await db.updateDocument(entry.document_id, {
                sync_status: 'error',
                updated_at: Date.now(),
            })
        }
    }

  // ── Push metadata : envoie les modifications locales au backend ────────────
  async function pushToCloud(): Promise<void> {
    const pendingMeta = (await db.getPendingSyncLogEntries())
      .filter(e => e.operation === 'update_meta' || e.operation === 'delete')
    if (pendingMeta.length === 0) return

    const documents = await Promise.all(
      pendingMeta.map(e => db.getDocumentById(e.document_id))
    )

    try {
      // Batch push (TDD §7.3 POST /api/documents/sync)
      const response = await $tidyApi<SyncPushResponse>('/documents/sync', {
        method: 'POST',
        body: {
          documents: documents.filter(Boolean).map(doc => ({
            id: doc!.id,
            original_filename: doc!.original_filename,
            mime_type: doc!.mime_type,
            file_size_bytes: doc!.file_size_bytes,
            tag: doc!.tag,
            ocr_text: doc!.ocr_text,
            ocr_status: doc!.ocr_status,
            is_deleted: doc!.is_deleted === 1,
            created_at: doc!.created_at,
            updated_at: doc!.updated_at,
          })),
        },
      })

      // Marque les entrées sync_log comme 'done'
      for (const result of response.results) {
        if (result.status !== 'skipped') {
          const entry = pendingMeta.find(e => e.document_id === result.id)
          if (entry) await db.updateSyncLogEntry(entry.id, 'done')
          await db.updateDocument(result.id, {
            sync_status: 'synced',
            synced_at: Date.now(),
          })
        }
      }
    } catch {
      // Push échoué = non bloquant — sera retenté au prochain cycle (NFR10)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _isNonRetryable(e: unknown): boolean {
    return [400, 401, 402, 403].includes((e as any)?.statusCode)
  }
  function _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
  function _bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
  }

  return { triggerAsync, syncAll, pullFromCloud }
}
```

### 5.11 Plugin Nuxt — Initialisation au démarrage

**Fichier** : `/plugins/database.client.ts`
Ce plugin initialise la chaîne complète au démarrage de l'app, dans le bon ordre de dépendances.

```typescript
// /plugins/database.client.ts
export default defineNuxtPlugin(async () => {
  // Ordre obligatoire (TDD §5.1)
  const crypto = useCrypto()
  await crypto.initEncryptionKey()   // Génère/charge la clé AES-256 (Keychain/Keystore)

  const db = useDatabase()
  await db.initDatabase()            // Ouvre SQLite chiffré + migrations DDL

  const network = useNetwork()
  await network.init()               // Listener réseau

  const lifecycle = useAppLifecycle()
  lifecycle.init()                   // Listener foreground/background

  // Scan des documents 'pending' laissés par un kill précédent (TDD §2.5)
  const pendingOcr = await db.getPendingOcrDocuments()
  if (pendingOcr.length > 0 && network.isOnline.value) {
    const wid = useWorkspaceStore().currentWorkspaceId
    if (wid) useSyncService().triggerAsync(wid)
  }
})
```

***

## 6. Types TypeScript Partagés (`/types`)

```typescript
// /types/document.ts

export type ProcessingStatus =
  | 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING'
  | 'PARTIALLY_ENRICHED' | 'CLASSIFIED_ONLY' | 'ENRICHED'
  | 'FAILED' | 'PENDING_RETRY' | 'ARCHIVED'

export type DetectedType =
  | 'INVOICE' | 'CONTRACT' | 'RECEIPT' | 'ID_DOCUMENT' | 'BANK_STATEMENT' | 'OTHER'

export interface ExtractedEntity {
  entityType: 'AMOUNT' | 'DATE' | 'VENDOR' | string
  value: string
  confidence: number
}

export interface DocumentIntelligence {
  detectedType: DetectedType | null
  suggestedTags: string[]
  globalConfidenceScore: number | null
  extractedEntities: ExtractedEntity[]
}

export interface DocumentMetadata {
  userTags: string[]
  notes: string | null
  userOverrideType: DetectedType | null
  lastEditedAt: string | null
}

export interface DocumentListItem {
  id: string
  workspaceId: string
  title: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  processingStatus: ProcessingStatus
  thumbnailUrl: string | null
  intelligence: DocumentIntelligence | null
  meta DocumentMetadata | null
  uploadedAt: string
  updatedAt: string
}

export interface DocumentDetail extends DocumentListItem {
  uploadedBy: string
  pageCount: number | null
  textExtractionMethod: 'NATIVE_PDF' | 'OCR' | 'NONE' | null
  extractedText: string | null
  downloadUrl: string | null
  processingEvents: ProcessingEvent[]
}

export interface ProcessingEvent {
  eventId: string
  eventType: string
  occurredAt: string
  isSuccess: boolean
  errorMessage: string | null
}

// /types/workspace.ts
export interface Workspace {
  id: string
  name: string
  description: string | null
  isArchived: boolean
  documentCount: number
  createdAt: string
  updatedAt: string
}

// /types/auth.ts
export interface User {
  id: string
  email: string
  displayName: string
  tier: 'free' | 'pro'
  createdAt: string
}
```

***

## 7. Règles d'Implémentation Strictes

Les règles suivantes sont non négociables. Elles synthétisent les contraintes croisées du TDD, du PRD et de l'UX Flow.

| # | Règle | Source |
|---|---|---|
| R1 | `ssr: false` dans `nuxt.config.ts` — aucune exception | TDD §2.1 |
| R2 | Chiffrement des fichiers via plugin natif uniquement — jamais `SubtleCrypto` JS | TDD §5.1, NFR4 |
| R3 | `refreshToken` stocké dans Secure Storage natif — jamais `localStorage` | TDD §5.4 |
| R4 | Le polling silencieux ne mute **jamais** `isLoadingList` — patch ciblé uniquement | UX Flow §5 |
| R5 | `DocumentStatusBadge` est le **seul** endroit de traduction statut → label UX | UX Flow §9 |
| R6 | Les mots `OCR`, `ENRICHED`, `MIME`, `confidence score` n'apparaissent **jamais** dans un template | UX Flow §9 Règle 3 |
| R7 | `IntelligenceSection` est **read-only** — aucun `v-model` sur ses champs | UX Flow §7 Règle 5 |
| R8 | `userTags` et `suggestedTags` ne sont jamais affichés dans le même composant `TagChip` sans distinction visuelle | UX Flow §7 |
| R9 | La `UploadProgressBar` n'existe que dans `/upload` — jamais dans le Dashboard | UX Flow §3.2 Règle critique |
| R10 | `stopPolling()` est appelé dans `onUnmounted()` de chaque page qui l'a démarré | UX Flow §5 |
| R11 | Tout état vide doit utiliser `EmptyState.vue` avec un CTA — jamais de template vide | UX Flow §9 Règle 1 |
| R12 | Tous les appels API passent par le composable `useTidyApi` — jamais de `$fetch` brut dans les composants | Architecture |
| R13 | `PATCH /documents/:id` envoie la liste `userTags` **complète** (pas de merge) | API Contract §PATCH documents |
| R14 | Le `downloadUrl` (presigned S3, TTL 15 min) est récupéré via `GET /documents/:id` — jamais mis en cache local | API Contract §GET documents/:id |
| R15 | `useDocumentStore` ne contient **aucun** appel `$tidyApi` — toutes les lectures passent par `useDatabase()` | TDD §2.1, PRD F3 |
| R16 | `useSyncService` est le **seul** composable autorisé à appeler `$tidyApi` pour les opérations documentaires | Architecture |
| R17 | Le polling de 5s interroge **SQLite local** — jamais une route API | UX Flow §5, TDD §7 |
| R18 | `initDatabase()` est appelé **avant** tout accès au store dans le plugin `/plugins/database.client.ts` | TDD §5.1 |
| R19 | `upsertDocumentFromCloud()` applique **last-write-wins** sur `updated_at` — jamais écraser une version locale plus récente | TDD §7.5 |
| R20 | Les fichiers S3 uploadés sont les fichiers **déjà chiffrés** côté client — jamais le plaintext | TDD §5.2, NFR4 |
| R21 | `processOcrQueue()` est **séquentiel** (pas de `Promise.all`) — un document bloque le suivant pour préserver la RAM sur device ≤ 3 Go | TDD §2.6 |
| R22 | Les erreurs de sync sont **silencieuses pour l'UI** — uniquement loggées dans la table `local_logs` (TDD §11.1) | UX Flow §9 Règle 4, NFR9 |
