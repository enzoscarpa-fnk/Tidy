# Domain Blueprint — Gestionnaire Documentaire Intelligent (MVP)

> Version : 1.0 · Scope : MVP · Méthodologie : DDD + BMAD

***

## 1. Objets Métier Centraux

### 1.1 `User`

| Attribut | Détail |
|---|---|
| **Description** | Acteur principal du système. Possède et administre ses Workspaces. |
| **Responsabilité** | Point d'entrée de la hiérarchie propriétaire. Porte l'identité et les droits d'accès. |
| **Attributs principaux** | `userId`, `email`, `displayName`, `createdAt`, `status` (actif / suspendu) |
| **Relations** | Possède 1..N `Workspace` |
| **Invariants** | Un User doit avoir au moins un Workspace actif. L'email est unique dans le système. |

***

### 1.2 `Workspace`

| Attribut | Détail |
|---|---|
| **Description** | Conteneur organisationnel d'un ensemble de documents appartenant à un User. Représente un contexte de travail (ex : "Pro", "Perso"). |
| **Responsabilité** | Isoler et organiser les documents par contexte métier. Assurer la séparation logique des contenus d'un même utilisateur. |
| **Attributs principaux** | `workspaceId`, `ownerId (→ User)`, `name`, `description`, `createdAt`, `isArchived` |
| **Relations** | Appartient à 1 `User` · Contient 0..N `Document` |
| **Invariants** | Un Workspace appartient à un seul User. Un Workspace archivé ne peut plus recevoir de nouveaux documents. Le nom est unique par User. |

***

### 1.3 `Document` *(Aggregate Root)*

C'est l'objet central du domaine. Il est l'Aggregate Root qui encapsule toutes les informations liées à un fichier traité.

| Attribut | Détail |
|---|---|
| **Description** | Représentation métier complète d'un fichier déposé, enrichie par le traitement automatique et modifiable manuellement. |
| **Responsabilité** | Maintenir la cohérence entre le fichier brut, son contenu indexable, ses métadonnées techniques et ses métadonnées intelligentes. Orchestrer son propre cycle de vie. |

**Attributs principaux :**

*Identité & appartenance :*
- `documentId`
- `workspaceId (→ Workspace)`
- `uploadedBy (→ User)`

*Métadonnées techniques :*
- `originalFilename`
- `mimeType` (PDF / image)
- `fileSizeBytes`
- `pageCount`
- `uploadedAt`
- `processingStatus` (cf. cycle de vie)

*Contenu indexable :*
- `extractedText` (source : PDF natif ou OCR)
- `textExtractionMethod` : `NATIVE_PDF` | `OCR` | `NONE`
- `thumbnailRef` (référence vers la miniature générée)

*Métadonnées intelligentes (Value Object `DocumentIntelligence`) :*
- `detectedType` (facture, contrat, reçu, autre…)
- `extractedEntities[]` : `{ entityType, value, confidence }`
- `globalConfidenceScore`
- `suggestedTags[]`

*Métadonnées éditables (Value Object `DocumentMetadata`) :*
- `title` (éditable par l'utilisateur)
- `userTags[]`
- `notes`
- `lastEditedAt`

**Relations :**
- Appartient à 1 `Workspace`
- Référence 1 `User` (uploadeur)
- Contient 0..N `ProcessingEvent` (journal d'audit du traitement)

**Invariants :**
- Un Document sans fichier brut ne peut pas exister.
- `processingStatus` ne peut régresser (pas de retour en arrière sauf `FAILED → PENDING_RETRY`).
- `DocumentIntelligence` ne peut être posée que si `processingStatus = ENRICHED` ou `PARTIALLY_ENRICHED`.
- Un Document doit toujours appartenir à un Workspace actif.
- `userTags` et `suggestedTags` sont des listes distinctes, non fusionnées automatiquement.

***

### 1.4 `ProcessingEvent` *(Entité enfant du Document)*

| Attribut | Détail |
|---|---|
| **Description** | Journal immuable des événements de traitement d'un Document. |
| **Responsabilité** | Traçabilité du pipeline d'enrichissement. Diagnostique des échecs. |
| **Attributs principaux** | `eventId`, `documentId`, `eventType` (OCR_STARTED, CLASSIFICATION_DONE, etc.), `occurredAt`, `payload`, `isSuccess`, `errorMessage?` |
| **Invariants** | Immuable après création. Toujours rattaché à un Document existant. |

***

## 2. Hiérarchie et Relations Globales

```
User
└── Workspace (1..N)
└── Document (0..N)  ← Aggregate Root
├── DocumentMetadata        [Value Object — éditable]
├── DocumentIntelligence    [Value Object — issu du traitement]
└── ProcessingEvent[]       [Entité enfant — immuable]
```

**Règles de traversée :**
- Tout accès à un Document passe nécessairement par son `workspaceId`.
- Un Document ne peut être déplacé entre Workspaces qu'explicitement (commande métier dédiée).
- Les `ProcessingEvent` ne sont jamais accédés directement depuis l'extérieur de l'Aggregate.

***

## 3. Cycle de Vie du Document

### États possibles

```
PENDING_UPLOAD
│
▼
UPLOADED ──────────────────────────────┐
│                                  │
▼                                  │
PROCESSING                             │ (PDF natif, pas d'OCR nécessaire)
│                                  │
├──► PARTIALLY_ENRICHED            │
│        │                         │
▼        ▼                         ▼
ENRICHED ◄──────────────────── CLASSIFIED_ONLY
│
▼
READY  ◄─── état stable final (consultable, éditable)
│
▼
ARCHIVED (sortie de circulation active)

──► FAILED (depuis PROCESSING ou PARTIALLY_ENRICHED)
│
▼
PENDING_RETRY ──► PROCESSING (retry)
```

### Transitions et Déclencheurs

| De | Vers | Déclencheur |
|---|---|---|
| `PENDING_UPLOAD` | `UPLOADED` | Fichier reçu et stocké avec succès |
| `UPLOADED` | `PROCESSING` | Déclenchement automatique du pipeline |
| `UPLOADED` | `CLASSIFIED_ONLY` | PDF natif searchable détecté, extraction texte OK, classification OK, OCR skipped |
| `PROCESSING` | `PARTIALLY_ENRICHED` | Texte extrait (OCR ou natif), classification non disponible |
| `PROCESSING` | `ENRICHED` | Texte + classification + entités extraites disponibles |
| `PARTIALLY_ENRICHED` | `ENRICHED` | Étape de classification complétée en différé |
| `ENRICHED` / `CLASSIFIED_ONLY` | `READY` | Validation finale du pipeline (thumbnail générée) |
| `PROCESSING` / `PARTIALLY_ENRICHED` | `FAILED` | Erreur non récupérable dans le pipeline |
| `FAILED` | `PENDING_RETRY` | Action utilisateur ou politique de retry automatique |
| `PENDING_RETRY` | `PROCESSING` | Relance du pipeline |
| `READY` | `ARCHIVED` | Action explicite de l'utilisateur |

***

## 4. Taxonomie des Objets

### Entités Métier *(identité persistante)*

| Objet | Rôle |
|---|---|
| `User` | Acteur propriétaire |
| `Workspace` | Conteneur organisationnel |
| `Document` | Aggregate Root central |
| `ProcessingEvent` | Journal d'audit (enfant de Document) |

### Value Objects *(pas d'identité propre, définis par leur valeur)*

| Objet | Porté par |
|---|---|
| `DocumentMetadata` | Document — partie éditable par l'utilisateur |
| `DocumentIntelligence` | Document — résultat du pipeline automatique |
| `ExtractedEntity` | DocumentIntelligence — ex : `{ type: "AMOUNT", value: "1250€", confidence: 0.92 }` |
| `Tag` | DocumentMetadata / DocumentIntelligence |

### Objets Techniques / Infrastructure *(hors domaine métier)*

> Ces objets ne font pas partie du modèle de domaine. Ils sont mentionnés ici pour délimitation explicite.

- Référence fichier brut (chemin de stockage objet)
- Référence thumbnail (chemin de stockage objet)
- Tokens d'authentification
- Files de traitement (queues)
- Pipelines OCR / ML (classifiers)

***

## 5. Décisions Structurantes

### Décision 1 — `Document` comme Aggregate Root unique

**Choix :** `Document` est l'unique Aggregate Root du domaine, incluant ses métadonnées et son intelligence comme Value Objects internes.

**Implication :** Toute modification (tags, titre, correction) passe par la racine `Document`. Aucune sous-entité n'est modifiable directement depuis l'extérieur.

**Risque :** Si `DocumentIntelligence` devient très volumineuse (V2/V3 avec historique de versions d'analyse), il faudra envisager un Aggregate séparé `DocumentAnalysis`.

***

### Décision 2 — Séparation stricte `userTags` vs `suggestedTags`

**Choix :** Les tags suggérés par le système et les tags posés par l'utilisateur sont des listes distinctes au sein de `DocumentMetadata` et `DocumentIntelligence`.

**Implication :** L'utilisateur ne "valide" pas les suggestions, il crée ses propres tags. La provenance est toujours traçable.

**Risque :** Divergence entre les deux listes difficile à réconcilier si on introduit un moteur de suggestion évolutif en V2.

***

### Décision 3 — OCR optionnel et non bloquant

**Choix :** Le pipeline ne requiert pas l'OCR pour qu'un document atteigne l'état `READY`. Un PDF natif searchable peut bypasser l'OCR.

**Implication :** Le champ `textExtractionMethod` est obligatoire pour tracer la source du texte indexable. La classification peut s'appuyer sur le texte natif.

**Risque :** Hétérogénéité de qualité des données indexées (texte OCR vs natif). La confiance des entités extraites doit être interprétée en regard de la méthode d'extraction.

***

### Décision 4 — `ProcessingEvent` comme journal immuable

**Choix :** Chaque étape du pipeline génère un `ProcessingEvent` immuable, stocké dans l'Aggregate.

**Implication :** Auditabilité complète, diagnostique des failures possible sans état externe. Coût : croissance de l'Aggregate.

**Risque :** En V2/V3, si le nombre d'événements devient important (retries multiples, re-classification), il faudra archiver les `ProcessingEvent` anciens hors de l'Aggregate actif.

***

### Décision 5 — Workspace comme frontière d'isolation

**Choix :** Un Document appartient toujours à exactement un Workspace. Le déplacement entre Workspaces est une commande métier explicite.

**Implication :** Les requêtes et les droits d'accès sont toujours scopés au Workspace. Permet une isolation forte des contextes.

**Risque :** Si un document doit être "partagé" entre Workspaces (cas collaboratif futur), ce modèle devra évoluer vers une référence partagée ou un mécanisme de duplication.

***

## 6. MVP Scope

### Strictement MVP

- [ ] Gestion `User` (création, authentification, profil minimal)
- [ ] CRUD `Workspace` (créer, renommer, archiver)
- [ ] Upload `Document` (PDF et images)
- [ ] Pipeline de traitement : extraction texte natif + OCR conditionnel + génération thumbnail
- [ ] Classification automatique du type de document
- [ ] Extraction d'entités clés (date, montant, fournisseur)
- [ ] Attribution de `suggestedTags`
- [ ] Édition manuelle des métadonnées (`title`, `userTags`, `notes`)
- [ ] Cycle de vie complet du Document (tous les états définis ci-dessus)
- [ ] Journal `ProcessingEvent` (traçabilité interne)
- [ ] Recherche par texte indexé (full-text sur `extractedText`)
- [ ] Filtrage par `detectedType`, `userTags`, `workspaceId`

### Reporté V2

- [ ] Déplacement de Document entre Workspaces
- [ ] Versioning des métadonnées intelligentes (historique des analyses)
- [ ] Partage d'un Document ou Workspace avec un tiers
- [ ] Règles de classification personnalisées par User
- [ ] Politiques de retry configurables par User
- [ ] Webhooks sur événements Document

### Reporté V3

- [ ] Analytics avancées (volumes, tendances, types récurrents)
- [ ] Workspace collaboratif multi-utilisateurs
- [ ] Pipeline de re-classification à la demande
- [ ] Export de données enrichies (CSV, rapport structuré)
- [ ] Apprentissage supervisé basé sur les corrections utilisateur

***

> **Ce Domain Blueprint constitue le contrat conceptuel du domaine. Tout Module Blueprint et tout API Contract devront s'y conformer strictement. Toute déviation doit être justifiée et documentée en tant que décision architecturale explicite.**

***

Le Blueprint s'appuie sur les principes fondamentaux du DDD tels que définis par Martin Fowler — notamment la notion d'Aggregate comme frontière transactionnelle et de consistance  — et sur la structure de production documentaire du BMAD Method, où l'Architect Agent produit des blueprints structurés exploitables directement par les agents aval (Module Blueprint, API Contract).[1][2][3]

Sources
[1] D D D_ Aggregate https://martinfowler.com/bliki/DDD_Aggregate.html
[2] The BMAD Method: A Framework for Spec Oriented AI-Driven ... https://recruit.group.gmo/engineer/jisedai/blog/the-bmad-method-a-framework-for-spec-oriented-ai-driven-development/
[3] BMad v6 Alpha | Agent-as-Code for Reliable AI Dev https://bmadcodes.com/v6-alpha/
[4] How entities covered with in an aggregate Root are saved ... https://stackoverflow.com/questions/60439844/how-entities-covered-with-in-an-aggregate-root-are-saved-in-ddd
[5] Managing Batch Updates of Aggregate Roots and Nested ... https://www.reddit.com/r/DomainDrivenDesign/comments/1e6fhvn/managing_batch_updates_of_aggregate_roots_and/
[6] Blog: From Good To Great in DDD: Understanding the ... https://www.kranio.io/en/blog/de-bueno-a-excelente-en-ddd-entendiendo-aggregates-y-aggregate-roots-en-domain-driven-design---3-10
[7] A problem with understanding aggregates and aggregate roots in Domain Driven Design (DDD) https://stackoverflow.com/questions/54744590/a-problem-with-understanding-aggregates-and-aggregate-roots-in-domain-driven-des
[8] Aggregate Root Design 101 | DDD, Clean Architecture, .NET 6 https://www.youtube.com/watch?v=0D3EB2jvQ44
[9] How to design great Aggregate Roots in Domain-Driven Design https://www.youtube.com/watch?v=Pkvt87yL6Gs
[10] BMAD-METHOD Guide: Breakthrough Agile AI-Driven Development https://redreamality.com/garden/notes/bmad-method-guide/
[11] bmad-code-org/BMAD-METHOD: Breakthrough Method for Agile Ai ... https://github.com/bmad-code-org/BMAD-METHOD
[12] Advanced BMad Techniques: Scaling AI-Driven Development (Part 3) https://buildmode.dev/blog/advanced-bmad-techniques-2025/
[13] Mastering the BMAD Method: A Better Approach to Agile AI-Driven ... https://www.linkedin.com/pulse/mastering-bmad-method-better-approach-agile-ai-driven-holt-nguyen-ojchc
[14] BMAD + Cursor: The First AI Framework That Actually Makes Sense ... https://www.kevintholland.com/bmad-cursor-the-first-ai-framework-that-actually-makes-sense-for-pms/
[15] BMad Code | AI Agent Framework [BMad Method] https://bmadcodes.com
