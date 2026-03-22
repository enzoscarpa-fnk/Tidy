# Module Blueprint — Gestionnaire Documentaire Intelligent (MVP)

> Version : 1.1 · Architecture : Monolithe Modulaire · Base : Domain Blueprint v1.0

***

## Préambule Architectural

Le monolithe modulaire est structuré selon deux niveaux distincts  :[1]

- **Macro-architecture** : découpe en modules à frontières explicites, communication contrôlée, isolation des données
- **Micro-architecture** : organisation interne par couche (Domain → Application → Infrastructure) avec des Vertical Slices par feature

Chaque module est traité comme une **unité autonome** avec son propre domaine, ses propres use cases et ses propres adapters. L'intégration entre modules se fait exclusivement via des **interfaces publiques contractuelles** et des **Domain Events internes** — la communication inter-modules est strictement asynchrone via l'`IEventBus`.[2]

***

## 1. Modules Principaux

### 1.1 Module `UserModule`

| Propriété | Détail |
|---|---|
| **Responsabilité** | Gestion du cycle de vie de l'acteur principal. Identité, profil, statut. |
| **Contient** | Entité `User`, invariants d'unicité email, commandes de création/modification, queries de lecture de profil |
| **Ne contient PAS** | Logique de Workspace, logique documentaire, authentification technique (JWT, sessions) |
| **Dépendances autorisées** | `SharedKernel` uniquement |
| **Dépendances interdites** | Tout autre module métier — `UserModule` est la racine, il ne dépend de rien |

***

### 1.2 Module `WorkspaceModule`

| Propriété | Détail |
|---|---|
| **Responsabilité** | Gestion des espaces de travail : création, renommage, archivage. Enforcement de l'isolation par User. |
| **Contient** | Entité `Workspace`, invariants (nom unique par User, archivage bloquant), commandes CRUD, queries de liste par User |
| **Ne contient PAS** | Logique documentaire, logique de traitement, index de recherche |
| **Dépendances autorisées** | `UserModule` (lecture — vérification existence User), `SharedKernel` |
| **Dépendances interdites** | `DocumentModule`, `ProcessingModule`, `SearchModule` |

***

### 1.3 Module `DocumentModule` *(Aggregate Root)*

| Propriété | Détail |
|---|---|
| **Responsabilité** | Propriétaire de l'Aggregate Root `Document`. Gère le cycle de vie complet, les métadonnées, et les transitions d'état. |
| **Contient** | Aggregate `Document`, Value Objects `DocumentMetadata` + `DocumentIntelligence`, entité `ProcessingEvent`, toutes les transitions d'état métier, commandes d'édition manuelle, queries de lecture |
| **Ne contient PAS** | Logique d'OCR, logique de classification, logique de génération de thumbnail, logique de recherche full-text |
| **Dépendances autorisées** | `WorkspaceModule` (lecture — vérification que le Workspace est actif), `SharedKernel` |
| **Dépendances interdites** | `ProcessingModule`, `SearchModule` — le Document ne sait pas qu'il sera traité ni indexé |

> **Principe clé :** `DocumentModule` expose des **commandes internes** permettant à d'autres modules de modifier l'état du Document (ex : `ApplyProcessingResult`, `TransitionStatus`). Il ne délègue jamais sa logique de transition.

***

### 1.4 Module `ProcessingModule`

| Propriété | Détail |
|---|---|
| **Responsabilité** | Orchestration du pipeline d'enrichissement : extraction texte, OCR conditionnel, classification, extraction d'entités, génération de thumbnail. |
| **Contient** | Service d'orchestration du pipeline, adapters vers OCR / Classifier / Thumbnail (en infra), gestion des retries, émission des `ProcessingEvent` |
| **Ne contient PAS** | Entités métier Document ou Workspace, logique de présentation, logique de recherche |
| **Dépendances autorisées** | `DocumentModule` (écriture via commandes internes — mise à jour d'état et intelligence), `SharedKernel` |
| **Dépendances interdites** | `WorkspaceModule`, `UserModule`, `SearchModule` |

***

### 1.5 Module `SearchModule`

| Propriété | Détail |
|---|---|
| **Responsabilité** | Indexation et interrogation du corpus documentaire. Recherche full-text sur `extractedText`, filtrage par `detectedType`, `userTags`, `workspaceId`. |
| **Contient** | Service d'indexation, modèle de projection read-only (`DocumentSearchView`), queries de recherche et filtrage |
| **Ne contient PAS** | Aggregate Document, logique d'état, logique de traitement, persistance canonique |
| **Dépendances autorisées** | `DocumentModule` (lecture événementielle — réaction aux changements d'état), `SharedKernel` |
| **Dépendances interdites** | `ProcessingModule`, `WorkspaceModule`, `UserModule` |

> **Note MVP :** Pour le MVP, la projection du `SearchModule` peut être implémentée directement au-dessus de la persistence canonique du `DocumentModule` si le volume ne justifie pas une projection dédiée. La séparation conceptuelle reste néanmoins conservée — les queries de recherche passent toujours par les handlers du `SearchModule` et jamais par ceux du `DocumentModule`.

***

## 2. Arborescence Logique

```
/modules
/user
/domain
User                    ← Entité métier
UserStatus              ← Value Object (actif / suspendu)
IUserRepository         ← Interface de port (sortante)
/application
/commands
CreateUser
UpdateUserProfile
SuspendUser
/queries
GetUserById
GetUserByEmail
/infra
UserRepositoryAdapter   ← Implémentation concrète du port

/workspace
/domain
Workspace               ← Entité métier
IWorkspaceRepository
/application
/commands
CreateWorkspace
RenameWorkspace
ArchiveWorkspace
/queries
GetWorkspacesByUser
GetWorkspaceById
/infra
WorkspaceRepositoryAdapter

/document
/domain
Document                ← Aggregate Root
DocumentMetadata        ← Value Object
DocumentIntelligence    ← Value Object
ExtractedEntity         ← Value Object
ProcessingEvent         ← Entité enfant (immuable)
ProcessingStatus        ← Enum d'états
IDocumentRepository
/application
/commands
InitiateDocumentUpload
ConfirmDocumentUploaded
TransitionDocumentStatus     ← commande interne (appelée par ProcessingModule)
ApplyDocumentIntelligence    ← commande interne (appelée par ProcessingModule)
UpdateDocumentMetadata       ← édition manuelle utilisateur
ArchiveDocument
RetryDocumentProcessing
/queries
GetDocumentById
GetDocumentsByWorkspace
GetDocumentProcessingHistory
/events
DocumentUploaded             ← Domain Event (écouté par ProcessingModule)
DocumentReady                ← Domain Event (écouté par SearchModule)
DocumentMetadataUpdated      ← Domain Event (écouté par SearchModule)
/infra
DocumentRepositoryAdapter

/processing
/application
/orchestration
ProcessingPipelineOrchestrator   ← point d'entrée unique du pipeline
PipelineStepRouter               ← décide OCR vs natif
/handlers
HandleDocumentUploaded           ← écoute le Domain Event (async)
/infra
/adapters
OcrServiceAdapter
TextExtractorAdapter             ← extraction texte natif PDF
DocumentClassifierAdapter
EntityExtractorAdapter
ThumbnailGeneratorAdapter

/search
/domain
DocumentSearchView               ← Projection read-only
/application
/commands
IndexDocument                  ← interne, déclenché par événements
UpdateDocumentIndex
RemoveDocumentFromIndex
/queries
SearchDocuments                ← full-text + filtres
/handlers
HandleDocumentReady            ← écoute Domain Event (async)
HandleDocumentMetadataUpdated
/infra
SearchIndexAdapter

/shared
/kernel
AggregateRoot                      ← classe de base
Entity
ValueObject
DomainEvent
IRepository<T>
Result<T>                          ← enveloppe de résultat sans exception
Pagination
/events
IEventBus                          ← interface de bus interne
InMemoryEventBus                   ← implémentation MVP (asynchrone non-bloquante)

/interfaces
/http
/user
UserController
/workspace
WorkspaceController
/document
DocumentController
DocumentUploadController
/search
SearchController
```

**Justification de la structure :**

La séparation `/modules` + `/shared` + `/interfaces` reflète trois périmètres distincts  :[3][1]
- `/modules` = logique métier isolée par Bounded Context
- `/shared` = primitives transversales sans logique métier propre
- `/interfaces` = adaptateurs entrants HTTP, agnostiques du domaine

***

## 3. Dépendances Inter-Modules

### Règles directionnelles

```
UserModule
▲
│ (vérifie existence)
WorkspaceModule
▲
│ (vérifie workspace actif)
DocumentModule  ──── émet ──►  [Domain Events — async]
▲                               │
│ (commandes internes)          ▼
ProcessingModule          SearchModule
(projections)
```

### Matrice des dépendances

| Module appelant → | UserModule | WorkspaceModule | DocumentModule | ProcessingModule | SearchModule |
|---|---|---|---|---|---|
| **UserModule** | — | ✗ INTERDIT | ✗ INTERDIT | ✗ INTERDIT | ✗ INTERDIT |
| **WorkspaceModule** | ✅ lecture | — | ✗ INTERDIT | ✗ INTERDIT | ✗ INTERDIT |
| **DocumentModule** | ✗ INTERDIT | ✅ lecture | — | ✗ INTERDIT | ✗ INTERDIT |
| **ProcessingModule** | ✗ INTERDIT | ✗ INTERDIT | ✅ commandes internes | — | ✗ INTERDIT |
| **SearchModule** | ✗ INTERDIT | ✗ INTERDIT | ✅ événements only | ✗ INTERDIT | — |

### Règles non négociables

1. **`DocumentModule` ne dépend jamais de `ProcessingModule`** — l'Aggregate ignore l'existence du pipeline[2]
2. **`ProcessingModule` ne lit jamais directement la persistence de `DocumentModule`** — il passe toujours par les commandes exposées
3. **`SearchModule` ne lit jamais directement la persistence canonique** — il consomme uniquement des Domain Events et maintient sa propre projection (ou opère via une vue read-only en MVP)
4. **La communication inter-modules se fait exclusivement** via : commandes internes explicites OU Domain Events — jamais d'appel direct à un Repository d'un autre module[2]

***

## 4. Séparation Métier / Application / Infrastructure

### Où vivent les objets

| Type d'objet | Couche | Localisation |
|---|---|---|
| Entités, Aggregates, Value Objects | **Domain** | `/modules/[x]/domain/` |
| Invariants et règles métier | **Domain** | Encapsulés dans les entités et VO |
| Interfaces de ports sortants (Repository, Services) | **Domain** | `/modules/[x]/domain/I*.ts` |
| Use Cases (Commands + Queries + Handlers) | **Application** | `/modules/[x]/application/` |
| Orchestration de pipeline | **Application** | `/modules/processing/application/orchestration/` |
| Domain Events (définition) | **Domain** | `/modules/[x]/domain/events/` |
| Listeners / Handlers d'événements | **Application** | `/modules/[x]/application/handlers/` |
| Adapters techniques (DB, OCR, Storage, Index) | **Infrastructure** | `/modules/[x]/infra/` |
| Controllers HTTP, validation des requêtes, sérialisation | **Interface** | `/interfaces/http/` |
| Primitives partagées (base classes, bus) | **Shared Kernel** | `/shared/` |

### Règle de dépendance (Dependency Rule)

```
Interface → Application → Domain
Infrastructure → Domain (implémente les interfaces)
Infrastructure ✗ Application (jamais)
Domain ✗ Application ✗ Infrastructure (jamais)
```

Les couches internes ne connaissent jamais les couches extérieures. L'injection de dépendance résout les ports à la composition root.[4]

***

## 5. Orchestration du Pipeline de Traitement

### Déclenchement

```
[HTTP] POST /documents/upload
│
▼
DocumentController
│  crée commande
▼
InitiateDocumentUpload (Command)
│  handler dans DocumentModule
▼
Document créé en état PENDING_UPLOAD
│  fichier transmis à StorageAdapter (infra)
▼
ConfirmDocumentUploaded (Command)
│  Document passe à UPLOADED
▼
Domain Event : DocumentUploaded émis sur IEventBus
│
│  ← HTTP retourne immédiatement ici
│     (réponse : documentId + status UPLOADED)
│
▼  [ASYNCHRONE — non bloquant]
HandleDocumentUploaded (ProcessingModule listener)
│
▼
ProcessingPipelineOrchestrator
```

> **Principe clé :** Le `ProcessingPipelineOrchestrator` est déclenché de manière **asynchrone (non bloquante)** via le bus d'événements interne. La requête HTTP d'upload retourne immédiatement après confirmation du stockage du fichier et de la transition vers `UPLOADED`. Le client suit l'avancement via polling sur `GET /documents/{id}` ou tout mécanisme de notification futur.[5]

### Pipeline interne (ProcessingModule)

```
ProcessingPipelineOrchestrator
│
├─► TextExtractorAdapter
│     ├─ PDF natif searchable ? → texte extrait, method = NATIVE_PDF
│     └─ Image ou PDF non searchable ? → route vers OcrServiceAdapter
│                                          method = OCR
│
├─► [Commande] TransitionDocumentStatus → PROCESSING (via DocumentModule)
│
├─► DocumentClassifierAdapter
│     └─ retourne : detectedType + confidence
│
├─► EntityExtractorAdapter
│     └─ retourne : extractedEntities[]
│
├─► ThumbnailGeneratorAdapter
│     └─ retourne : thumbnailRef
│
├─► [Commande] ApplyDocumentIntelligence → (via DocumentModule)
│     Document encapsule DocumentIntelligence, transitions vers ENRICHED
│
└─► [Commande] TransitionDocumentStatus → READY
Domain Event : DocumentReady émis (async)
│
└─► HandleDocumentReady (SearchModule) → IndexDocument
```

### Gestion des échecs

```
Échec dans une étape du pipeline
│
├─► ProcessingEvent immuable créé (isSuccess: false, errorMessage)
├─► [Commande] TransitionDocumentStatus → FAILED
└─► (MVP) Log de l'erreur, retry manuel via UI

RetryDocumentProcessing (Command, déclenché par l'utilisateur)
│
├─► Document → PENDING_RETRY → PROCESSING
└─► Re-déclenchement de ProcessingPipelineOrchestrator
```

### Principe de préservation de l'encapsulation

`ProcessingModule` ne modifie **jamais** directement l'état interne du Document. Il envoie des **commandes contractuelles** que `DocumentModule` traite en appliquant ses propres invariants. Le Document reste le seul juge de la validité d'une transition d'état.[6]

***

## 6. Simplifications MVP Assumées

### Simplifications volontaires

| Simplification | Justification | Évolution future |
|---|---|---|
| **Bus d'événements asynchrone in-process** (`InMemoryEventBus`) avec exécution non bloquante | Aucune complexité distribuée, pas de broker externe. Le `ProcessingPipelineOrchestrator` est déclenché de manière asynchrone via ce bus, libérant immédiatement la requête HTTP d'upload | V2 : remplacement par un bus asynchrone persistant (ex : queue de jobs) si la durabilité des événements devient critique |
| **Pipeline de traitement asynchrone in-process** | Le déclenchement est non bloquant (via Domain Event), mais l'exécution reste in-process — suffisant pour un solo developer MVP | V2 : passage à un worker dédié ou une queue de jobs si la latence ou la résilience l'exige |
| **Pas de CQRS avec read model séparé** pour `DocumentModule` | Le volume MVP ne justifie pas deux modèles distincts | V2 : extraction d'un read model dénormalisé si les queries deviennent complexes |
| **`SearchModule` sans projection matérialisée dédiée** | Pour le MVP, la projection du `SearchModule` peut s'appuyer directement sur la persistence canonique du `DocumentModule` si le volume ne le justifie pas. La séparation conceptuelle est conservée : les queries passent toujours par les handlers du `SearchModule` | V2 : projection dédiée et/ou moteur full-text externe si le volume l'exige |
| **Un seul type de retry** (manuel par l'utilisateur) | Politique de retry configurable = sur-ingénierie MVP | V2 : policies de retry automatique par User |
| **Pas de Domain Events persistés** (event sourcing) | Complexité excessive pour MVP | V3 : event sourcing si l'historique des états devient critique |
| **Pas de module `NotificationModule`** | Webhooks et notifications = V2 | V2 : découplage via Domain Events existants, ajout d'un listener |
| **Pas de versioning de `DocumentIntelligence`** | Complexité V2 | V2 : extraction vers un Aggregate `DocumentAnalysis` séparé |

### Limites connues et acceptées

- `InMemoryEventBus` asynchrone in-process : pas de garantie de livraison si le processus redémarre entre l'émission de l'événement et son traitement → **mitigation MVP** : réindexation manuelle et retry utilisateur ; l'état `FAILED` est traçable
- `ProcessingEvent` grossit avec les retries → **mitigation MVP** : acceptable dans le volume MVP, archivage prévu V2
- Projection `SearchModule` sur persistence canonique en MVP → **cohérence immédiate** garantie, mais couplage de déploiement entre les deux modules → **mitigation** : la frontière conceptuelle est préservée, la migration vers une projection dédiée est non destructive

***

## 7. Cohérence avec le Domain Blueprint

### Points de cohérence vérifiés

**Aggregate boundaries respectées ✅**
- `Document` est le seul point de modification de son état interne
- `ProcessingEvent` n'est jamais accessible directement depuis l'extérieur de l'Aggregate
- Aucun module ne contient une seconde représentation des entités d'un autre module (sauf projections read-only explicites dans `SearchModule`)

**Invariants préservés ✅**
- L'invariant "Workspace actif requis" est vérifié dans le handler de `InitiateDocumentUpload` avant la création du Document (lecture dans `WorkspaceModule`)
- L'invariant "pas de régression de status" est encapsulé dans la méthode de transition du Document — `TransitionDocumentStatus` échoue si la transition est invalide
- L'invariant "DocumentIntelligence posable seulement sur ENRICHED/PARTIALLY_ENRICHED" est appliqué dans `ApplyDocumentIntelligence` côté `DocumentModule`

**Cycle de vie respecté ✅**
- Chaque transition documentée dans le Domain Blueprint correspond à une commande applicative ou à une étape du pipeline explicitement nommée
- L'état `CLASSIFIED_ONLY` (PDF natif searchable, OCR skipped) est géré par le `PipelineStepRouter` dans `ProcessingModule`
- Le retour immédiat de la requête HTTP est cohérent avec le cycle de vie : le Document est en état `UPLOADED` à la fin de la requête, la progression vers `PROCESSING` est asynchrone

**Séparation Value Objects respectée ✅**
- `DocumentMetadata` (éditable) et `DocumentIntelligence` (issue du pipeline) restent deux Value Objects distincts dans le domain de `DocumentModule`
- `userTags` et `suggestedTags` ne sont jamais fusionnés : `userTags` vit dans `DocumentMetadata`, `suggestedTags` vit dans `DocumentIntelligence`
- `ExtractedEntity` reste un Value Object imbriqué dans `DocumentIntelligence`, non exposé directement

**Règle de traversée respectée ✅**
- Toute query sur les documents prend obligatoirement `workspaceId` en paramètre — aucune query globale cross-workspace
- Le déplacement de Document entre Workspaces est absent du MVP, aucune commande ne le permet

***

> **Ce Module Blueprint v1.1 constitue le contrat structurel de l'implémentation. L'API Contract devra mapper chaque endpoint vers une commande ou query applicative définie ici. Toute déviation doit être documentée explicitement.**

***

Ce Module Blueprint s'appuie sur le principe de communication inter-modules strictement asynchrone via un bus d'événements in-memory, la séparation Domain/Application/Infrastructure issue du DDD layered architecture, et le positionnement des Vertical Slices à l'intérieur des frontières de modules.[1][4][2]

Sources
[1] Where Vertical Slices Fit Inside the Modular Monolith Architecture https://www.milanjovanovic.tech/blog/where-vertical-slices-fit-inside-the-modular-monolith-architecture
[2] kgrzybek/modular-monolith-with-ddd - GitHub https://github.com/kgrzybek/modular-monolith-with-ddd
[3] Building a Modular Monolith With Vertical Slice Architecture in .NET https://antondevtips.com/blog/building-a-modular-monolith-with-vertical-slice-architecture-in-dotnet
[4] From Good To Great in DDD: Understanding the Suggested ... - Kranio https://www.kranio.io/en/blog/de-bueno-a-excelente-en-ddd-comprender-el-patron-de-arquitectura-sugerida-en-domain-driven-design---7-10
[5] Building Modular Monoliths with Logical Boundaries Hexagonal ... https://www.softwareseni.com/building-modular-monoliths-with-logical-boundaries-hexagonal-architecture-and-internal-messaging/
[6] D D D_ Aggregate https://martinfowler.com/bliki/DDD_Aggregate.html
[7] Event Driven Architecture Done Right: How to Scale Systems with ... https://www.growin.com/blog/event-driven-architecture-scale-systems-2025/
[8] Anti-patterns in event-driven architecture - Hacker News https://news.ycombinator.com/item?id=40619521
[9] Crafting a self-documenting Modular Monolith with DDD principles (theory not included) @ Spring I/O https://www.youtube.com/watch?v=O3Cytc-sJSc
[10] GitHub - kgrzybek/modular-monolith-with-ddd: Full Modular Monolith application with Domain-Driven Design approach. https://github.com/kgrzybek/modular-monolith-with-ddd/
[11] Using Events To Start Breaking Down A Monolith https://www.youtube.com/watch?v=E9lYyWEqWcs
[12] What (event-driven) architecture should I choose for a modular data processing pipeline? https://stackoverflow.com/questions/58845725/what-event-driven-architecture-should-i-choose-for-a-modular-data-processing-p
[13] Patterns https://ptrchm.com/posts/ruby-on-rails-event-driven-modular-monolith/
[14] Event-Driven Architecture: The Hard Parts | Three Dots Labs blog https://threedots.tech/episode/event-driven-architecture/
