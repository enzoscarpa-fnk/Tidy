# Database & Persistence Blueprint — Backend (Node.js + Fastify + PostgreSQL)

**Version** : 1.0
**Stack** : Prisma ORM · PostgreSQL · Node.js + Fastify
**Scope** : MVP strict — 5 modèles de domaine
**Dernière mise à jour** : Mars 2026
**Documents sources** : TDD §7.2 · Domain Blueprint v1.0 · API Contract v1.0

***

## Table des Matières

1. [Fichier `schema.prisma` complet](#1-fichier-schemaprisma-complet)
2. [Architecture du dossier de persistance](#2-architecture-du-dossier-de-persistance)
3. [Plugin Prisma pour Fastify](#3-plugin-prisma-pour-fastify)
4. [Mapping Domain ↔ Prisma](#4-mapping-domain--prisma)
5. [Stratégie Last Write Wins (LWW)](#5-stratégie-last-write-wins-lww)
6. [Index & Considérations Performances](#6-index--considérations-performances)

***

## 1. Fichier `schema.prisma` complet

### Décisions de modélisation

Avant le code, voici les arbitrages structurants :

| Décision | Choix | Justification |
|---|---|---|
| `DocumentMetadata` (VO éditable) | JSONB `metadata` + colonne `title` promue | `title` doit être queryable/triable — le reste (userTags, notes) va en JSONB avec index GIN |
| `DocumentIntelligence` (VO automatique) | JSONB `intelligence` + colonne `detectedType` promue | `detectedType` filtre fréquent (`?detectedType=INVOICE`) → colonne dédiée pour index B-tree |
| `updatedAt` sur `Document` | Champ manuel, **pas** `@updatedAt` | Ce champ est la clock cliente (LWW) — Prisma ne doit PAS l'écraser automatiquement |
| Enums PostgreSQL natifs | `UserTier`, `ProcessingStatus`, etc. | Typage fort, rejet en base, pas de contrainte CHECK manuelle |
| `RefreshToken` | Modèle dédié (nécessité MVP auth) | Rotation obligatoire — un token révoqué doit être invalidable sans toucher `User` |

### `schema.prisma`

```prisma
// ============================================================
// prisma/schema.prisma
// GED Intelligente — MVP Backend
// ============================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// ENUMS
// ============================================================

enum UserTier {
  FREE
  PRO
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum ProcessingStatus {
  PENDING_UPLOAD
  UPLOADED
  PROCESSING
  PARTIALLY_ENRICHED
  ENRICHED
  CLASSIFIED_ONLY
  READY
  FAILED
  PENDING_RETRY
  ARCHIVED
}

enum TextExtractionMethod {
  NATIVE_PDF
  OCR
  NONE
}

enum DetectedType {
  INVOICE
  CONTRACT
  RECEIPT
  ID_DOCUMENT
  BANK_STATEMENT
  OTHER
}

// ============================================================
// MODEL : User
// Acteur principal. Porte l'identité et le tier d'abonnement.
// Invariant : email unique globalement.
// ============================================================

model User {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email         String    @unique
  passwordHash  String
  displayName   String    @db.VarChar(100)
  tier          UserTier  @default(FREE)
  status        UserStatus @default(ACTIVE)
  createdAt     DateTime  @default(now()) @db.Timestamptz
  updatedAt     DateTime  @updatedAt @db.Timestamptz

  // Relations
  workspaces    Workspace[]
  documents     Document[]   @relation("UploadedBy")
  shareLinks    ShareLink[]
  refreshTokens RefreshToken[]

  @@map("users")
}

// ============================================================
// MODEL : RefreshToken
// Nécessité MVP : rotation à chaque usage, révocation individuelle.
// Le token lui-même n'est jamais stocké — uniquement son hash SHA-256.
// ============================================================

model RefreshToken {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String    @db.Uuid
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash  String    @unique  // SHA-256 du refresh token brut
  expiresAt  DateTime  @db.Timestamptz
  revokedAt  DateTime? @db.Timestamptz
  createdAt  DateTime  @default(now()) @db.Timestamptz

  @@index([userId])
  @@index([tokenHash])
  @@map("refresh_tokens")
}

// ============================================================
// MODEL : Workspace
// Conteneur organisationnel d'un User.
// Invariant : nom unique par User (@@unique([ownerId, name])).
// ============================================================

model Workspace {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId     String    @db.Uuid
  owner       User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  name        String    @db.VarChar(100)
  description String?   @db.VarChar(500)
  isArchived  Boolean   @default(false)
  createdAt   DateTime  @default(now()) @db.Timestamptz
  updatedAt   DateTime  @updatedAt @db.Timestamptz

  // Relations
  documents   Document[]

  // Contrainte d'unicité : un User ne peut pas avoir deux Workspaces au même nom
  @@unique([ownerId, name])
  @@index([ownerId, isArchived])
  @@map("workspaces")
}

// ============================================================
// MODEL : Document (Aggregate Root)
//
// Colonnes "promues" hors JSONB pour queryabilité :
//   - title          → tri + FTS
//   - detectedType   → filtre fréquent (index B-tree)
//   - processingStatus → filtre polling client
//
// Value Objects aplatis en JSONB :
//   - metadata     → DocumentMetadata { userTags, notes, lastEditedAt }
//   - intelligence → DocumentIntelligence { extractedEntities, globalConfidenceScore, suggestedTags }
//                    (detectedType promu en colonne dédiée)
//
// ATTENTION : updatedAt = horloge CLIENTE (LWW source of truth).
//             Ne PAS utiliser @updatedAt — Prisma ne doit pas l'écraser.
// ============================================================

model Document {
  // --- Identité & appartenance ---
  id              String    @id @db.Uuid   // UUID généré côté client — pas de gen_random_uuid()
  workspaceId     String    @db.Uuid
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  uploadedById    String    @db.Uuid
  uploadedBy      User      @relation("UploadedBy", fields: [uploadedById], references: [id], onDelete: Cascade)

  // --- Métadonnées techniques ---
  originalFilename String
  mimeType         String              // "application/pdf" | "image/jpeg" | "image/png"
  fileSizeBytes    BigInt
  pageCount        Int?
  s3Key            String?             // Clé S3 après upload fichier
  thumbnailRef     String?             // Chemin thumbnail CDN

  // --- Cycle de vie ---
  processingStatus     ProcessingStatus      @default(PENDING_UPLOAD)
  textExtractionMethod TextExtractionMethod?
  isDeleted            Boolean               @default(false)

  // --- Contenu indexable ---
  extractedText   String?  @db.Text

  // --- Value Object DocumentMetadata (éditable par l'utilisateur) ---
  // Structure JSONB attendue :
  // {
  //   "title": "Facture Adobe Janvier 2025",  ← dupliqué pour accès direct
  //   "userTags": ["logiciel-créatif", "adobe"],
  //   "notes": "À déclarer Q1 2025",
  //   "lastEditedAt": "2026-03-01T11:30:00.000Z" | null
  // }
  title    String           // Promu pour tri et FTS — toujours en sync avec metadata.title
  metadata Json             @db.JsonB  // DocumentMetadata VO

  // --- Value Object DocumentIntelligence (issu du pipeline) ---
  // Structure JSONB attendue :
  // {
  //   "extractedEntities": [
  //     { "entityType": "AMOUNT", "value": "1250€", "confidence": 0.97 },
  //     { "entityType": "DATE",   "value": "2025-01-12", "confidence": 0.99 }
  //   ],
  //   "globalConfidenceScore": 0.94,
  //   "suggestedTags": ["facture", "logiciel", "adobe"]
  // }
  detectedType  DetectedType?  // Promu hors JSONB pour index + filtre efficace
  intelligence  Json?          @db.JsonB  // DocumentIntelligence VO (sans detectedType)

  // --- Timestamps ---
  // uploadedAt : timestamp de création (horloge serveur au premier POST /documents)
  // updatedAt  : timestamp CLIENT de dernière modification (source LWW) — géré manuellement
  // syncedAt   : timestamp serveur de dernière sync reçue
  uploadedAt  DateTime  @db.Timestamptz
  updatedAt   DateTime  @db.Timestamptz  // ⚠ PAS @updatedAt — valeur cliente
  syncedAt    DateTime  @default(now()) @db.Timestamptz

  // Relations
  processingEvents ProcessingEvent[]
  shareLinks       ShareLink[]

  // Index (voir section 6 pour détails)
  @@index([workspaceId, processingStatus])
  @@index([workspaceId, detectedType])
  @@index([workspaceId, uploadedAt(sort: Desc)])
  @@index([workspaceId, updatedAt(sort: Desc)])
  @@index([isDeleted, processingStatus])
  @@map("documents")
}

// ============================================================
// MODEL : ProcessingEvent (Entité enfant immuable de Document)
// Journal d'audit du pipeline. Jamais modifié après création.
// payload : données contextuelles de l'étape (OCR confidence,
//           classification scores, message d'erreur détaillé, etc.)
// ============================================================

model ProcessingEvent {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId   String   @db.Uuid
  document     Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  eventType    String   // "OCR_STARTED" | "OCR_DONE" | "CLASSIFICATION_DONE" | "THUMBNAIL_GENERATED" | "PIPELINE_FAILED" | ...
  occurredAt   DateTime @db.Timestamptz
  payload      Json?    @db.JsonB  // Données contextuelles de l'événement
  isSuccess    Boolean
  errorMessage String?

  @@index([documentId, occurredAt(sort: Asc)])
  @@map("processing_events")
}

// ============================================================
// MODEL : ShareLink
// Lien de partage temporaire sécurisé (token 256 bits, base64url).
// Invariant : un seul lien actif par document (géré en applicatif,
//             pas par contrainte DB — la révocation est atomique
//             via transaction, voir TDD §8.2).
// ============================================================

model ShareLink {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId   String    @db.Uuid
  document     Document  @relation(fields: [documentId], references: [id], onDelete: Cascade)
  userId       String    @db.Uuid
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  token        String    @unique              // randomBytes(32).toString('base64url') — 43 chars
  expiresAt    DateTime  @db.Timestamptz
  isRevoked    Boolean   @default(false)
  accessCount  Int       @default(0)          // Compteur d'accès public (observabilité)
  createdAt    DateTime  @default(now()) @db.Timestamptz

  @@index([token])                            // O(log n) sur lookup public /s/:token
  @@index([documentId])
  @@index([expiresAt], where: "is_revoked = false")
  @@map("share_links")
}
```

> **Note sur `metadata` default** : l'insertion d'un nouveau document initialise `metadata` avec `{ "title": "<originalFilename>", "userTags": [], "notes": null, "lastEditedAt": null }`. Ce défaut est géré au niveau du Repository, pas en base (Prisma ne supporte pas les defaults JSONB complexes nativement).

***

## 2. Architecture du dossier de persistance

```
src/
├── infra/
│   └── database/
│       ├── prisma/
│       │   ├── schema.prisma                        ← Source unique de vérité du schéma
│       │   └── migrations/                          ← Générées par `prisma migrate dev`
│       │       └── 20260301_init/
│       │           └── migration.sql
│       │
│       ├── prisma.plugin.ts                         ← Plugin Fastify (instanciation + lifecycle)
│       │
│       └── repositories/
│           ├── document.repository.adapter.ts       ← Mapping Document Domain ↔ Prisma
│           ├── workspace.repository.adapter.ts
│           ├── user.repository.adapter.ts
│           └── share-link.repository.adapter.ts
│
└── modules/
    ├── document/
    │   └── domain/
    │       ├── document.aggregate.ts                ← Aggregate Root (pure domain)
    │       ├── document-metadata.value-object.ts    ← VO éditable
    │       ├── document-intelligence.value-object.ts ← VO pipeline
    │       └── ports/
    │           └── document.repository.port.ts      ← Interface (port)
    └── ...
```

**Règle d'or** : le dossier `infra/database/` ne doit jamais être importé directement depuis les modules `domain/`. Les modules domain connaissent uniquement les **ports** (interfaces TypeScript). Les **adapters** (implémentations Prisma) sont dans `infra/` et injectés au démarrage.

***

## 3. Plugin Prisma pour Fastify

### Problème : fuites de connexion

Sans encapsulation, chaque rechargement à chaud ou test crée une nouvelle instance `PrismaClient`, ouvre un nouveau pool de connexions PostgreSQL, et l'ancien pool n'est jamais fermé. Sur un VPS avec `max_connections = 100`, cela sature la base en quelques minutes.

### Solution : Plugin Fastify avec `fastify-plugin`

```typescript
// src/infra/database/prisma.plugin.ts
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';

// Augmentation du type Fastify pour accès typé depuis les handlers
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const prisma = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

  // En développement, on logue les requêtes lentes (> 500ms)
  if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e) => {
      if (e.duration > 500) {
        fastify.log.warn({ query: e.query, duration: e.duration }, 'Slow Prisma query');
      }
    });
  }

  await prisma.$connect();
  fastify.log.info('Prisma connected to PostgreSQL');

  // Décoration : accessible via `fastify.prisma` dans tous les handlers
  fastify.decorate('prisma', prisma);

  // Fermeture propre du pool à l'arrêt du serveur
  fastify.addHook('onClose', async (instance) => {
    fastify.log.info('Disconnecting Prisma...');
    await instance.prisma.$disconnect();
  });
});

export default prismaPlugin;
```

### Pourquoi `fp()` (fastify-plugin) est indispensable

Sans `fp()`, le `decorate('prisma', ...)` est **encapsulé** dans le scope du sous-plugin et n'est pas visible par les routes frères ou parents. `fp()` "perce" l'encapsulation Fastify et propage le décorateur sur l'instance globale. C'est la différence entre un plugin utilitaire partagé et un plugin isolé.

### Enregistrement dans `app.ts`

```typescript
// src/app.ts
import Fastify from 'fastify';
import prismaPlugin from './infra/database/prisma.plugin';

export async function buildApp() {
  const fastify = Fastify({ logger: true });

  // Le plugin prisma est enregistré en premier — disponible pour tous les modules
  await fastify.register(prismaPlugin);

  // Puis les modules métier
  await fastify.register(import('./modules/auth/auth.routes'), { prefix: '/api/v1/auth' });
  await fastify.register(import('./modules/document/document.routes'), { prefix: '/api/v1/documents' });
  // ...

  return fastify;
}
```

***

## 4. Mapping Domain ↔ Prisma

### Le problème fondamental

Prisma retourne un objet "plat" : `metadata` et `intelligence` sont des `JsonValue` (type opaque). Le domain attend des Value Objects typés (`DocumentMetadata`, `DocumentIntelligence`) avec leurs invariants et méthodes. Le Repository Adapter est la seule couche qui connaît les deux mondes et effectue la traduction.

### Les types du domaine (rappel)

```typescript
// src/modules/document/domain/document-metadata.value-object.ts
export class DocumentMetadata {
  constructor(
    public readonly title: string,
    public readonly userTags: ReadonlyArray<string>,
    public readonly notes: string | null,
    public readonly lastEditedAt: Date | null,
  ) {}

  withTitle(newTitle: string): DocumentMetadata {
    return new DocumentMetadata(newTitle, this.userTags, this.notes, new Date());
  }

  withUserTags(tags: string[]): DocumentMetadata {
    return new DocumentMetadata(this.title, tags, this.notes, new Date());
  }

  toJSON(): MetadataJson {
    return {
      title: this.title,
      userTags: [...this.userTags],
      notes: this.notes,
      lastEditedAt: this.lastEditedAt?.toISOString() ?? null,
    };
  }
}

// src/modules/document/domain/document-intelligence.value-object.ts
export class DocumentIntelligence {
  constructor(
    public readonly detectedType: DetectedType,
    public readonly extractedEntities: ReadonlyArray<ExtractedEntity>,
    public readonly globalConfidenceScore: number,
    public readonly suggestedTags: ReadonlyArray<string>,
  ) {}

  toJSON(): IntelligenceJson {
    return {
      extractedEntities: this.extractedEntities.map((e) => ({ ...e })),
      globalConfidenceScore: this.globalConfidenceScore,
      suggestedTags: [...this.suggestedTags],
    };
  }
}
```

### `DocumentRepositoryAdapter` — Mapping complet

```typescript
// src/infra/database/repositories/document.repository.adapter.ts
import type { PrismaClient, Document as PrismaDocument, Prisma } from '@prisma/client';
import type { IDocumentRepository } from '../../../modules/document/domain/ports/document.repository.port';
import { Document }              from '../../../modules/document/domain/document.aggregate';
import { DocumentMetadata }      from '../../../modules/document/domain/document-metadata.value-object';
import { DocumentIntelligence }  from '../../../modules/document/domain/document-intelligence.value-object';

// ----------------------------------------------------------------
// Types des JSONB (contrat interne à la couche infra)
// ----------------------------------------------------------------
interface MetadataJson {
  title: string;
  userTags: string[];
  notes: string | null;
  lastEditedAt: string | null;
}

interface IntelligenceJson {
  extractedEntities: Array<{ entityType: string; value: string; confidence: number }>;
  globalConfidenceScore: number;
  suggestedTags: string[];
}

export class DocumentRepositoryAdapter implements IDocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ----------------------------------------------------------------
  // PIVOT : Prisma (plat) → Domain Aggregate (riche)
  // C'est ici que les JSONB sont désérialisés et validés.
  // ----------------------------------------------------------------
  private toDomain(row: PrismaDocument): Document {
    // Désérialisation du VO DocumentMetadata
    const metaJson = row.metadata as MetadataJson;
    const metadata = new DocumentMetadata(
      metaJson.title,
      metaJson.userTags ?? [],
      metaJson.notes,
      metaJson.lastEditedAt ? new Date(metaJson.lastEditedAt) : null,
    );

    // Désérialisation du VO DocumentIntelligence (nullable avant ENRICHED)
    let intelligence: DocumentIntelligence | null = null;
    if (row.intelligence && row.detectedType) {
      const intelJson = row.intelligence as IntelligenceJson;
      intelligence = new DocumentIntelligence(
        row.detectedType,           // Colonne dédiée (plus fiable que JSONB)
        intelJson.extractedEntities,
        intelJson.globalConfidenceScore,
        intelJson.suggestedTags ?? [],
      );
    }

    return new Document({
      id:                   row.id,
      workspaceId:          row.workspaceId,
      uploadedById:         row.uploadedById,
      originalFilename:     row.originalFilename,
      mimeType:             row.mimeType,
      fileSizeBytes:        Number(row.fileSizeBytes),   // BigInt → number (safe jusqu'à ~9 Po)
      pageCount:            row.pageCount,
      processingStatus:     row.processingStatus,
      textExtractionMethod: row.textExtractionMethod,
      extractedText:        row.extractedText,
      thumbnailRef:         row.thumbnailRef,
      s3Key:                row.s3Key,
      isDeleted:            row.isDeleted,
      metadata,             // ← Value Object reconstruit
      intelligence,         // ← Value Object reconstruit (null si pas encore enrichi)
      uploadedAt:           row.uploadedAt,
      updatedAt:            row.updatedAt,
    });
  }

  // ----------------------------------------------------------------
  // PIVOT : Domain Aggregate → Prisma (plat)
  // Applati les Value Objects en scalaires et JSONB.
  // ----------------------------------------------------------------
  private toPrismaCreate(doc: Document): Prisma.DocumentCreateInput {
    return {
      id:               doc.id,
      workspace:        { connect: { id: doc.workspaceId } },
      uploadedBy:       { connect: { id: doc.uploadedById } },
      originalFilename: doc.originalFilename,
      mimeType:         doc.mimeType,
      fileSizeBytes:    BigInt(doc.fileSizeBytes),
      pageCount:        doc.pageCount,
      processingStatus: doc.processingStatus,
      s3Key:            doc.s3Key,
      thumbnailRef:     doc.thumbnailRef,
      isDeleted:        doc.isDeleted,
      // VO → scalaires + JSONB
      title:            doc.metadata.title,
      metadata:         doc.metadata.toJSON(),
      detectedType:     doc.intelligence?.detectedType ?? null,
      intelligence:     doc.intelligence?.toJSON() ?? Prisma.JsonNull,
      uploadedAt:       doc.uploadedAt,
      updatedAt:        doc.updatedAt,   // Horloge cliente — pas @updatedAt
    };
  }

  // ----------------------------------------------------------------
  // Lecture
  // ----------------------------------------------------------------
  async findById(id: string): Promise<Document | null> {
    const row = await this.prisma.document.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByWorkspace(
    workspaceId: string,
    filters: DocumentFilters,
  ): Promise<{ items: Document[]; total: number }> {
    const where: Prisma.DocumentWhereInput = {
      workspaceId,
      isDeleted: false,
      ...(filters.processingStatus && { processingStatus: { in: filters.processingStatus } }),
      ...(filters.detectedType    && { detectedType:     { in: filters.detectedType } }),
      ...(filters.dateFrom        && { uploadedAt:       { gte: filters.dateFrom } }),
      ...(filters.dateTo          && { uploadedAt:       { lte: filters.dateTo } }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { [filters.sortBy ?? 'uploadedAt']: filters.sortOrder ?? 'desc' },
        skip:  (filters.page - 1) * filters.limit,
        take:  filters.limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items: rows.map(this.toDomain.bind(this)), total };
  }

  // ----------------------------------------------------------------
  // Écriture
  // ----------------------------------------------------------------
  async save(doc: Document): Promise<void> {
    await this.prisma.document.create({ data: this.toPrismaCreate(doc) });
  }

  async update(doc: Document): Promise<void> {
    await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        processingStatus:     doc.processingStatus,
        textExtractionMethod: doc.textExtractionMethod,
        extractedText:        doc.extractedText,
        thumbnailRef:         doc.thumbnailRef,
        s3Key:                doc.s3Key,
        isDeleted:            doc.isDeleted,
        title:                doc.metadata.title,
        metadata:             doc.metadata.toJSON(),
        detectedType:         doc.intelligence?.detectedType ?? null,
        intelligence:         doc.intelligence?.toJSON() ?? Prisma.JsonNull,
        updatedAt:            doc.updatedAt,
        // syncedAt géré dans syncUpsert, pas ici
      },
    });
  }
}
```

***

## 5. Stratégie Last Write Wins (LWW)

### Contexte technique

L'endpoint `POST /api/documents/sync` (TDD §7.3) reçoit un batch de documents depuis le client mobile. Pour chaque document, la règle est :

- **Si le document n'existe pas** → créer
- **Si `clientUpdatedAt > serverUpdatedAt`** → mettre à jour (le client a la version plus récente)
- **Si `clientUpdatedAt ≤ serverUpdatedAt`** → ignorer (le serveur a déjà une version plus récente ou identique)

### Pourquoi `prisma.upsert()` est insuffisant

`prisma.upsert()` ne supporte pas de condition WHERE sur la clause UPDATE. Il met toujours à jour si le `where` matche. On ne peut donc pas exprimer "update seulement si `clientUpdatedAt > existingUpdatedAt`" avec l'API Prisma standard.

### Solution A — Transaction Prisma (recommandée pour MVP)

Lisible, maintenable, sécurisée. Deux round-trips, mais acceptable à l'échelle MVP (< 10k users, batches typiques de 5–20 documents).

```typescript
// src/infra/database/repositories/document.repository.adapter.ts (suite)

type SyncResult = 'created' | 'updated' | 'skipped';

interface SyncDocumentPayload {
  id: string;
  workspaceId: string;
  uploadedById: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  tag: string;
  ocrText: string | null;
  ocrStatus: string;
  s3Key: string | null;
  isDeleted: boolean;
  clientCreatedAt: Date;    // Horloge cliente
  clientUpdatedAt: Date;    // Horloge cliente — source LWW
}

async syncUpsert(payload: SyncDocumentPayload): Promise<SyncResult> {
  return this.prisma.$transaction(async (tx) => {
    // 1. Lire l'état actuel en base
    const existing = await tx.document.findUnique({
      where: { id: payload.id },
      select: { updatedAt: true },    // On ne lit que ce dont on a besoin
    });

    // 2. CAS : document inexistant → CREATE
    if (!existing) {
      await tx.document.create({
         data: {
          id:               payload.id,
          workspace:        { connect: { id: payload.workspaceId } },
          uploadedBy:       { connect: { id: payload.uploadedById } },
          originalFilename: payload.originalFilename,
          mimeType:         payload.mimeType,
          fileSizeBytes:    BigInt(payload.fileSizeBytes),
          processingStatus: 'UPLOADED',
          isDeleted:        payload.isDeleted,
          title:            payload.originalFilename,
          metadata: {
            title:        payload.originalFilename,
            userTags:     [],
            notes:        null,
            lastEditedAt: null,
          },
          intelligence: Prisma.JsonNull,
          uploadedAt: payload.clientCreatedAt,
          updatedAt:  payload.clientUpdatedAt,   // Horloge cliente
          syncedAt:   new Date(),                // Horloge serveur
        },
      });
      return 'created';
    }

    // 3. CAS : document existant, LWW — comparer les timestamps
    //    clientUpdatedAt DOIT être strictement supérieur pour gagner.
    //    En cas d'égalité exacte (ms) : le serveur gagne (skipped).
    if (payload.clientUpdatedAt <= existing.updatedAt) {
      return 'skipped';
    }

    // 4. CAS : client plus récent → UPDATE
    await tx.document.update({
      where: { id: payload.id },
      data: {
        originalFilename: payload.originalFilename,
        isDeleted:        payload.isDeleted,
        s3Key:            payload.s3Key,
        updatedAt:        payload.clientUpdatedAt,  // Horloge cliente
        syncedAt:         new Date(),               // Horloge serveur
        // Note : metadata.title et intelligence ne sont PAS écrasés ici
        // car le pipeline d'enrichissement côté serveur est la source de vérité
        // pour ces champs. Seuls les champs "éditables client" sont LWW.
      },
    });
    return 'updated';
  });
}
```

### Solution B — Raw SQL avec `ON CONFLICT … WHERE` (alternative haute performance)

Pour un future batch de plusieurs centaines de documents (V2), un seul aller-retour vers PostgreSQL est préférable :

```typescript
async syncUpsertRaw(payload: SyncDocumentPayload): Promise<void> {
  // Prisma tagged template literal — paramètres automatiquement échappés (pas d'injection SQL)
  await this.prisma.$executeRaw`
    INSERT INTO documents (
      id, workspace_id, uploaded_by_id,
      original_filename, mime_type, file_size_bytes,
      processing_status, is_deleted, s3_key,
      title, metadata, intelligence,
      uploaded_at, updated_at, synced_at
    ) VALUES (
      ${payload.id}::uuid,
      ${payload.workspaceId}::uuid,
      ${payload.uploadedById}::uuid,
      ${payload.originalFilename},
      ${payload.mimeType},
      ${BigInt(payload.fileSizeBytes)},
      'UPLOADED',
      ${payload.isDeleted},
      ${payload.s3Key},
      ${payload.originalFilename},
      ${JSON.stringify({
        title: payload.originalFilename,
        userTags: [],
        notes: null,
        lastEditedAt: null,
      })}::jsonb,
      NULL,
      ${payload.clientCreatedAt},
      ${payload.clientUpdatedAt},
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET
        original_filename = EXCLUDED.original_filename,
        is_deleted        = EXCLUDED.is_deleted,
        s3_key            = EXCLUDED.s3_key,
        updated_at        = EXCLUDED.updated_at,
        synced_at         = NOW()
      WHERE
        -- Condition LWW : n'écraser que si le client est plus récent
        documents.updated_at < EXCLUDED.updated_at
  `;
}
```

> **Recommandation MVP** : utiliser la **Solution A** (transaction Prisma). Elle est plus lisible, plus maintenable, et plus facile à débugger. Elle retourne aussi le résultat (`created/updated/skipped`) sans un `RETURNING` SQL supplémentaire. La Solution B est à utiliser si le profiling révèle un bottleneck sur le sync batch en V2.

### Handler du sync endpoint

```typescript
// src/modules/document/interfaces/http/document.handler.ts (extrait)

async function syncDocumentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { documents } = request.body as SyncBatchBody;
  const userId = request.user.sub;

  const results = await Promise.all(
    documents.map(async (doc) => {
      // Vérifier l'ownership du workspace (sécurité obligatoire)
      const workspace = await workspaceRepo.findById(doc.workspaceId);
      if (!workspace || workspace.ownerId !== userId) {
        return { id: doc.id, status: 'forbidden' as const };
      }

      const status = await documentRepo.syncUpsert({
        ...doc,
        uploadedById:     userId,
        clientCreatedAt:  new Date(doc.createdAt),   // Timestamp ms client → Date
        clientUpdatedAt:  new Date(doc.updatedAt),
      });

      return {
        id:               doc.id,
        status,
        serverUpdatedAt:  new Date().toISOString(),
      };
    }),
  );

  return reply.code(200).send({ data: { results }, meta: {}, error: null });
}
```

***

## 6. Index & Considérations Performances

Les index suivants sont générés automatiquement par les directives `@@index` du `schema.prisma`. Cette section documente leur raison d'être pour éviter une suppression accidentelle lors de futures migrations.

| Index | Table | Colonnes | Usage |
|---|---|---|---|
| `documents_workspaceId_processingStatus` | `documents` | `(workspaceId, processingStatus)` | `GET /documents?workspaceId=&status=` — filtre principal liste |
| `documents_workspaceId_detectedType` | `documents` | `(workspaceId, detectedType)` | `GET /documents?detectedType=INVOICE` — filtre fréquent |
| `documents_workspaceId_uploadedAt` | `documents` | `(workspaceId, uploadedAt DESC)` | Tri par défaut de la liste |
| `documents_workspaceId_updatedAt` | `documents` | `(workspaceId, updatedAt DESC)` | `GET /sync?since=<timestamp>` — sync incrémentale |
| `documents_isDeleted_processingStatus` | `documents` | `(isDeleted, processingStatus)` | Requêtes administratives (crons, monitoring) |
| `share_links_token` | `share_links` | `(token)` | Lookup `/s/:token` — O(log n) |
| `share_links_expiresAt_partial` | `share_links` | `(expiresAt) WHERE is_revoked = false` | Cron TTL cleanup — ne scanne que les liens actifs |
| `processing_events_documentId_occurredAt` | `processing_events` | `(documentId, occurredAt ASC)` | `GET /documents/:id` — chargement events triés |
| `refresh_tokens_tokenHash` | `refresh_tokens` | `(tokenHash)` | Validation JWT refresh — lookup unique |

### Index GIN pour `userTags` (recherche dans JSONB)

Le filtre `?userTags=logiciel,adobe` requiert un index GIN sur le tableau JSONB. Non générable via `@@index` Prisma, à ajouter via migration SQL raw :

```sql
-- prisma/migrations/YYYYMMDD_add_gin_index/migration.sql
CREATE INDEX CONCURRENTLY idx_documents_user_tags_gin
  ON documents USING GIN ((metadata -> 'userTags') jsonb_path_ops);
```

### Index Full-Text Search (PostgreSQL `tsvector`)

La recherche `?query=adobe facture` opère sur `extractedText + title`. L'index GIN tsvector est également en migration SQL raw :

```sql
-- Colonne calculée tsvector (générée et indexée)
ALTER TABLE documents
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('french',
      coalesce(title, '') || ' ' ||
      coalesce(extracted_text, '')
    )
  ) STORED;

CREATE INDEX CONCURRENTLY idx_documents_fts
  ON documents USING GIN (search_vector);
```

> Ces deux migrations raw sont à placer dans `prisma/migrations/` avec la convention de nommage Prisma et exécutées via `prisma migrate deploy` comme n'importe quelle migration.

***

*Database & Persistence Blueprint v1.0 — aligné sur TDD v1.0 · Domain Blueprint v1.0 · API Contract v1.0*
