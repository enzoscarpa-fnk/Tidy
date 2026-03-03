# 11 — Checklist — Plan d'Exécution MVP
**Application** : Tidy — Gestionnaire Documentaire Mobile
**Version** : 1.0
**Statut** : Prêt pour agent de code IA (Cursor / Cline / Aider)
**Dernière mise à jour** : Mars 2026
**Sources** : Task Breakdown v1.0

---

> **Conventions de lecture**
> - `[ ]` = ticket à réaliser · `[x]` = ticket terminé
> - **Ref :** indique le(s) blueprint(s) prioritaires à charger avant de coder
> - **🧪 TDD checkpoint** : écrire les tests AVANT de passer au ticket suivant
> - Chaque ticket est conçu pour être terminé en **1 à 2 prompts** sans perte de contexte
> - **L'ordre est strict** : ne pas commencer une phase si la précédente n'est pas complète

---

## Vue d'ensemble des Phases

| Phase | Périmètre | Dépend de |
|-------|-----------|-----------|
| **Phase 1** | Infra & Setup Backend | — |
| **Phase 2** | Backend Auth & User | Phase 1 |
| **Phase 3** | Backend Workspace | Phase 2 |
| **Phase 4** | Backend Document & Pipeline OCR | Phase 3 |
| **Phase 5** | Backend Sync, Search & Share | Phase 4 |
| **Phase 6** | Frontend Init & Auth | Phase 2 |
| **Phase 7** | Frontend Workspace & Dashboard | Phase 6 |
| **Phase 8** | Frontend Document UI | Phase 7 |
| **Phase 9** | Frontend Search | Phase 7 |
| **Phase 10** | Frontend SQLite & Offline Base | Phase 6 |
| **Phase 11** | Frontend Sync Service | Phase 5 + Phase 10 |
| **Phase 12** | Frontend Share Feature | Phase 5 + Phase 8 |
| **Phase 13** | Capacitor Native & OCR Mobile | Phase 10 + Phase 11 |
| **Phase 14** | QA, Polish & Release Prep | Toutes les phases |

---

## Phase 1 — Infra & Setup Backend

> **Objectif** : avoir un backend Fastify qui démarre, se connecte à PostgreSQL via Prisma, et passe les tests de santé.

- [x] **Ticket 1.1 — Init monorepo et structure dossiers**
  Créer la structure `/backend` + `/mobile`. Initialiser `pnpm workspaces` (ou npm workspaces). Ajouter `.gitignore`, `.editorconfig`, `.nvmrc` (Node 20 LTS).
  **Ref :** `03-technical-design-document.md §1`

- [x] **Ticket 1.2 — Bootstrap Fastify + TypeScript**
  Init `package.json` dans `/backend`. Installer `fastify`, `typescript`, `ts-node`, `@types/node`. Créer `src/app.ts` avec `buildApp()`, `src/server.ts` avec le listen. Configurer `tsconfig.json` (strict mode).
  **Ref :** `03-technical-design-document.md §1.1` · `09-database-persistence-blueprint.md §3`

- [x] **Ticket 1.3 — Docker Compose dev (PostgreSQL + app)**
  Créer `docker-compose.yml` avec service `postgres` (image `postgres:16`, port `5432`, credentials via env). Ajouter script `npm run dev:db` dans `package.json`. Créer `.env.example` avec `DATABASE_URL`, `JWT_SECRET`, `PORT`.
  **Ref :** `03-technical-design-document.md §1`

- [x] **Ticket 1.4 — Setup Prisma et connexion DB**
  Installer `prisma` + `@prisma/client`. Créer `prisma/schema.prisma` avec `datasource db` PostgreSQL et `generator client`. Tester la connexion avec `prisma db pull` (DB vide). Créer le plugin Fastify `src/infra/database/prisma.plugin.ts` avec `fp()`, `$connect`, hook `onClose`.
  **Ref :** `09-database-persistence-blueprint.md §3`

- [x] **Ticket 1.5 — Error Handler global + Response format**
  Créer `src/shared/error-handler.plugin.ts`. Enregistrer un `setErrorHandler` Fastify qui formate toutes les erreurs selon la structure `{ data: null, meta: {}, error: { code, message, details } }`. Créer les helpers `createSuccessResponse()` et `createErrorResponse()`.
  **Ref :** `07-api-contract.md §2`

- [x] **Ticket 1.6 — Setup Vitest + premier test de santé**
  Installer `vitest`, `@vitest/coverage-v8`, `supertest`. Créer `vitest.config.ts`. Écrire un premier test `GET /health` → 200 `{ status: 'ok' }`. Ajouter scripts `test`, `test:coverage` dans `package.json`.
  **Ref :** `03-technical-design-document.md §1`

- [ ] **Ticket 1.7 — CI GitHub Actions basique**
  Créer `.github/workflows/ci.yml` : checkout → Node 20 → `pnpm install` → `prisma generate` → `vitest run`. Déclencher sur `push` et `pull_request` sur `main`.
  **Ref :** `03-technical-design-document.md §1`

**🧪 TDD checkpoint Phase 1** : `GET /health` retourne 200. La CI passe. Prisma se connecte à la DB Docker sans erreur.

---

## Phase 2 — Backend Auth & User

> **Objectif** : register, login, refresh token opérationnels avec JWT. Middleware d'auth appliqué.

- [ ] **Ticket 2.1 — Schéma Prisma : User + RefreshToken**
  Ajouter les modèles `User` et `RefreshToken` dans `schema.prisma` (enums `UserTier`, `UserStatus` inclus). Générer la première migration : `prisma migrate dev --name init_user_auth`. Vérifier que la migration SQL est correcte.
  **Ref :** `09-database-persistence-blueprint.md §1`

- [ ] **Ticket 2.2 — UserRepositoryAdapter**
  Créer `src/infra/database/repositories/user.repository.adapter.ts`. Implémenter : `findByEmail(email)`, `findById(id)`, `create(data)`, `updateTier(id, tier)`. Créer le port `src/modules/user/domain/ports/user.repository.port.ts`.
  **Ref :** `09-database-persistence-blueprint.md §2` · `05-module-blueprint.md §1.1`

- [ ] **Ticket 2.3 — RefreshTokenRepositoryAdapter**
  Créer `src/infra/database/repositories/refresh-token.repository.adapter.ts`. Implémenter : `create(userId, tokenHash, expiresAt)`, `findByHash(hash)`, `revoke(id)`, `revokeAllForUser(userId)`.
  **Ref :** `09-database-persistence-blueprint.md §1` · `07-api-contract.md §3 Module Auth`

- [ ] **Ticket 2.4 — Service Auth : hash + JWT helpers**
  Créer `src/modules/auth/application/auth.service.ts`. Implémenter : `hashPassword(plain)` (bcrypt, rounds=12), `verifyPassword(plain, hash)`, `generateAccessToken(userId, tier)` (JWT HS256, 1h), `generateRefreshToken()` (randomBytes(32).toString('hex')), `hashToken(token)` (SHA-256).
  **Ref :** `07-api-contract.md §1 Authentification` · `03-technical-design-document.md §9`

- [ ] **Ticket 2.5 — Route POST /api/v1/auth/register**
  Créer `src/modules/auth/interfaces/http/auth.routes.ts`. Implémenter `POST /register` : validation JSON Schema (email, password ≥ 8, displayName), `hashPassword`, create User, create Workspace "Mon espace", generate tokens, return 201.
  **Ref :** `07-api-contract.md §3 POST /auth/register` · `04-domain-blueprint.md §1.1`

- [ ] **Ticket 2.6 — Route POST /api/v1/auth/login**
  Implémenter `POST /login` dans `auth.routes.ts` : lookup user par email (même réponse si email inconnu ou mdp faux), bcrypt compare, generate tokens, store refreshToken hash, return 200.
  **Ref :** `07-api-contract.md §3 POST /auth/login`

- [ ] **Ticket 2.7 — Route POST /api/v1/auth/refresh (rotation)**
  Implémenter `POST /refresh` : hash le token reçu, lookup en DB, vérifier non révoqué + non expiré, révoquer l'ancien, générer une nouvelle paire, return 200. Si token révoqué re-soumis → révoquer TOUS les tokens du user.
  **Ref :** `07-api-contract.md §3 POST /auth/refresh`

- [ ] **Ticket 2.8 — Middleware JWT `authenticate`**
  Créer `src/shared/plugins/authenticate.hook.ts`. Hook `onRequest` Fastify : extraire `Authorization: Bearer <token>`, vérifier signature HS256, vérifier expiration, injecter `request.user = { sub, tier }`. Retourner 401 avec le bon code d'erreur si invalide.
  **Ref :** `07-api-contract.md §1 Authentification`

- [ ] **Ticket 2.9 — Routes GET + PATCH /api/v1/me**
  Créer `src/modules/user/interfaces/http/user.routes.ts`. `GET /me` : lookup user par `request.user.sub`, return profil. `PATCH /me` : valider `displayName`, update, return profil mis à jour. Appliquer le hook `authenticate`.
  **Ref :** `07-api-contract.md §3 Module Me`

**🧪 TDD checkpoint Phase 2** : Tests d'intégration sur register / login / refresh / /me. Vérifier : token expiré → 401, refresh révoqué → 401, double-soumission refresh → révocation cascade.

---

## Phase 3 — Backend Workspace

> **Objectif** : CRUD Workspace complet avec enforcement des invariants (nom unique, archivage, 1 workspace minimum).

- [ ] **Ticket 3.1 — Schéma Prisma : Workspace**
  Ajouter le modèle `Workspace` dans `schema.prisma` (avec `@@unique([ownerId, name])`, `@@index([ownerId, isArchived])`). Générer la migration `add_workspace`.
  **Ref :** `09-database-persistence-blueprint.md §1`

- [ ] **Ticket 3.2 — WorkspaceRepositoryAdapter**
  Créer `src/infra/database/repositories/workspace.repository.adapter.ts`. Implémenter : `create(data)`, `findById(id)`, `findAllByUser(userId, includeArchived)`, `update(id, data)`, `delete(id)`, `countActiveByUser(userId)`, `countDocuments(workspaceId)`.
  **Ref :** `09-database-persistence-blueprint.md §2` · `05-module-blueprint.md §1.2`

- [ ] **Ticket 3.3 — Routes POST + GET /api/v1/workspaces**
  Créer `src/modules/workspace/interfaces/http/workspace.routes.ts`. `POST /workspaces` : valider name/description, vérifier unicité, create, return 201. `GET /workspaces` : liste paginée des workspaces du user avec `documentCount`.
  **Ref :** `07-api-contract.md §3 Module Workspaces`

- [ ] **Ticket 3.4 — Routes GET + PATCH + DELETE /api/v1/workspaces/:id**
  `GET /:id` : ownership check → return détail. `PATCH /:id` : ownership + invariants (archived block sauf désarchivage, name uniqueness). `DELETE /:id` : ownership + guard "dernier workspace actif" → soft delete cascade.
  **Ref :** `07-api-contract.md §3 PATCH/DELETE /workspaces/:id` · `04-domain-blueprint.md §1.2`

**🧪 TDD checkpoint Phase 3** : Tests sur WORKSPACE_NAME_DUPLICATE, WORKSPACE_ARCHIVED (modification bloquée), suppression du dernier workspace (rejetée), et access d'un workspace d'un autre user (403).

---

## Phase 4 — Backend Document & Pipeline OCR

> **Objectif** : upload de document opérationnel, pipeline OCR asynchrone (InMemoryEventBus), statuts gérés.

- [ ] **Ticket 4.1 — Schéma Prisma : Document, ProcessingEvent, ShareLink**
  Ajouter les 3 modèles dans `schema.prisma` (enums `ProcessingStatus`, `TextExtractionMethod`, `DetectedType`). **Attention** : `updatedAt` sur `Document` est manuel (pas `@updatedAt`). Générer migration `add_document_pipeline_share`.
  **Ref :** `09-database-persistence-blueprint.md §1`

- [ ] **Ticket 4.2 — Migrations SQL raw (FTS + GIN)**
  Créer `prisma/migrations/YYYYMMDD_add_fts_gin/migration.sql` : colonne `search_vector` tsvector GENERATED STORED sur `(title || extractedText)` tokenizer `french`, index GIN `idx_documents_fts`, index GIN `idx_documents_user_tags_gin` sur `metadata->'userTags'`.
  **Ref :** `09-database-persistence-blueprint.md §6`

- [ ] **Ticket 4.3 — DocumentRepositoryAdapter (base)**
  Créer `src/infra/database/repositories/document.repository.adapter.ts`. Implémenter : `create(data)`, `findById(id)`, `findAllByWorkspace(wId, filters, pagination)`, `update(id, data)`, `softDelete(id)`, `updateStatus(id, status)`. Mapper Prisma ↔ Domain (Value Objects `DocumentMetadata`, `DocumentIntelligence`).
  **Ref :** `09-database-persistence-blueprint.md §4`

- [ ] **Ticket 4.4 — S3 Service Adapter**
  Créer `src/infra/storage/s3.service.adapter.ts`. Installer `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Implémenter : `putObject(key, buffer, mimeType)`, `deleteObject(key)`, `generatePresignedGetUrl(key, expiresIn)`, `generatePresignedPutUrl(key, mimeType, expiresIn)`. Variables d'env : `AWS_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
  **Ref :** `03-technical-design-document.md §4` · `07-api-contract.md §3 POST /files/upload-url`

- [ ] **Ticket 4.5 — OCR Proxy Adapter (Mistral)**
  Créer `src/infra/ocr/mistral-ocr.adapter.ts`. Installer `node-fetch` (ou utiliser fetch natif Node 20). Implémenter `processDocument(base64, mimeType)` → appel `api.mistral.ai/v1/ocr`, parser la réponse, retourner `{ text, confidence }`. Variable d'env : `MISTRAL_API_KEY`. Gérer timeout 30s + erreur 503.
  **Ref :** `03-technical-design-document.md §5`

- [ ] **Ticket 4.6 — Text Extractor Adapter (PDF natif)**
  Créer `src/infra/processing/text-extractor.adapter.ts`. Installer `pdf-parse`. Implémenter `extractFromPdf(buffer)` → retourner `{ text, method: 'NATIVE_PDF' }` si le PDF contient du texte natif, sinon retourner `{ text: null, method: 'OCR_NEEDED' }`.
  **Ref :** `05-module-blueprint.md §1.4 ProcessingModule`

- [ ] **Ticket 4.7 — Document Classifier Adapter (règles keywords)**
  Créer `src/infra/processing/document-classifier.adapter.ts`. Implémenter `classify(text)` → règles de détection de mots-clés par type (`INVOICE` : "facture", "invoice", "montant dû" ; `CONTRACT` : "contrat", "accord" ; etc.). Retourner `{ detectedType, confidence }`.
  **Ref :** `04-domain-blueprint.md §1.3 DocumentIntelligence` · `05-module-blueprint.md §1.4`

- [ ] **Ticket 4.8 — Entity Extractor Adapter**
  Créer `src/infra/processing/entity-extractor.adapter.ts`. Implémenter `extractEntities(text)` avec des regex : montant (`\d+[.,]\d{2}\s*€`), date (formats DD/MM/YYYY etc.), IBAN, SIRET. Retourner `ExtractedEntity[]` avec `{ entityType, value, confidence }`.
  **Ref :** `04-domain-blueprint.md §1.3 ExtractedEntity`

- [ ] **Ticket 4.9 — Thumbnail Generator Adapter**
  Créer `src/infra/processing/thumbnail-generator.adapter.ts`. Installer `sharp`. Implémenter `generateFromImage(buffer)` → resize 200x200 JPEG, retourner buffer. Pour PDF : extraire la première page avec `pdf2pic` ou `poppler`, puis sharp.
  **Ref :** `03-technical-design-document.md §2.6`

- [ ] **Ticket 4.10 — InMemoryEventBus**
  Créer `src/shared/events/in-memory-event-bus.ts`. Implémenter `IEventBus` : `publish(event)` (fire-and-forget asynchrone via `setImmediate`), `subscribe(eventType, handler)`. Ne PAS await les handlers — la requête HTTP ne doit pas être bloquée.
  **Ref :** `05-module-blueprint.md §6 Simplifications MVP`

- [ ] **Ticket 4.11 — ProcessingPipelineOrchestrator**
  Créer `src/modules/processing/application/orchestration/processing-pipeline.orchestrator.ts`. Orchestrer : TextExtractor → (si OCR needed) OcrAdapter → Classifier → EntityExtractor → ThumbnailGenerator → `updateStatus(ENRICHED)` → émettre `DocumentReady`. En cas d'échec → `updateStatus(FAILED)` + créer `ProcessingEvent` immuable.
  **Ref :** `05-module-blueprint.md §5`

- [ ] **Ticket 4.12 — Handler DocumentUploaded + abonnement bus**
  Créer `src/modules/processing/application/handlers/handle-document-uploaded.handler.ts`. S'abonner à `DocumentUploaded` sur le bus. Handler : appeler `ProcessingPipelineOrchestrator`. Enregistrer l'abonnement dans `app.ts` au démarrage.
  **Ref :** `05-module-blueprint.md §5 Déclenchement`

- [ ] **Ticket 4.13 — Route POST /api/v1/documents (upload multipart)**
  Installer `@fastify/multipart`. Créer `src/modules/document/interfaces/http/document.routes.ts`. `POST /documents` : parser multipart (file + workspaceId + title optionnel), valider MIME (`pdf/jpeg/png`) + taille (≤ 50 Mo), stocker fichier en S3, créer Document en DB (status `UPLOADED`), émettre `DocumentUploaded` sur le bus, return 201 immédiat.
  **Ref :** `07-api-contract.md §3 POST /documents`

- [ ] **Ticket 4.14 — Routes GET /documents, GET /documents/:id**
  `GET /documents` : filtres (workspaceId, processingStatus, detectedType, query FTS, userTags), pagination, tri. `GET /documents/:id` : document complet avec `processingEvents[]` (triés `occurredAt ASC`), `downloadUrl` (presigned S3 GET 15min).
  **Ref :** `07-api-contract.md §3 GET /documents`

- [ ] **Ticket 4.15 — Routes PATCH, DELETE, reprocess, archive**
  `PATCH /documents/:id` : modifier `DocumentMetadata` uniquement (title, userTags, notes, userOverrideType). `DELETE /:id` : soft delete. `POST /:id/reprocess` : guard FAILED → PENDING_RETRY → émettre event. `POST /:id/archive` : guard ENRICHED|CLASSIFIED_ONLY → ARCHIVED.
  **Ref :** `07-api-contract.md §3 PATCH/DELETE/reprocess/archive`

**🧪 TDD checkpoint Phase 4** : Test upload d'un PDF → polling status → statut ENRICHED. Test upload image → OCR déclenché. Test upload fichier trop lourd → 413. Test reprocess sur doc non-FAILED → 422.

---

## Phase 5 — Backend Sync, Search & Share

> **Objectif** : endpoint de sync LWW opérationnel, recherche FTS PostgreSQL, share links publics.

- [ ] **Ticket 5.1 — DocumentRepositoryAdapter : méthode syncUpsert (LWW)**
  Implémenter `syncUpsert(payload)` dans `document.repository.adapter.ts` : transaction Prisma, si inexistant → CREATE, si existant + `clientUpdatedAt <= existing.updatedAt` → skip, sinon → UPDATE. Retourner `'created' | 'updated' | 'skipped'`.
  **Ref :** `09-database-persistence-blueprint.md §5`

- [ ] **Ticket 5.2 — Route POST /api/v1/documents/sync (push batch)**
  `POST /documents/sync` : accepter `{ documents: SyncDocumentPayload[] }`, vérifier ownership workspace pour chaque doc, appeler `syncUpsert`, retourner `{ results: [{ id, status, serverUpdatedAt }] }`.
  **Ref :** `07-api-contract.md §3 POST /documents/sync` · `09-database-persistence-blueprint.md §5`

- [ ] **Ticket 5.3 — Route GET /api/v1/documents/sync (pull since)**
  `GET /documents/sync?since=<timestamp>&workspaceId=<id>` : retourner tous les documents du workspace modifiés après `since` (filtre sur `syncedAt`), inclure les soft-deleted (`isDeleted: true`). Retourner aussi `server_timestamp` pour le prochain pull.
  **Ref :** `07-api-contract.md §3 GET /documents/sync`

- [ ] **Ticket 5.4 — Route POST /api/v1/files/upload-url (presigned PUT)**
  `POST /files/upload-url` : valider `{ document_id, mime_type, file_size_bytes }`, vérifier ownership, générer presigned PUT S3 URL valable 10 min, retourner `{ upload_url, s3_key }`.
  **Ref :** `07-api-contract.md §3 POST /files/upload-url` · `03-technical-design-document.md §4`

- [ ] **Ticket 5.5 — Route GET /api/v1/documents/search (FTS PostgreSQL)**
  Implémenter la recherche full-text via `search_vector @@ plainto_tsquery('french', ?)` + filtre `detectedType`, `userTags` (GIN), `workspaceId`. Construire la query Prisma avec `$queryRaw`. Retourner extraits (`ts_headline`) avec termes surlignés.
  **Ref :** `07-api-contract.md §3 GET /documents/search` · `09-database-persistence-blueprint.md §6`

- [ ] **Ticket 5.6 — ShareLinkRepositoryAdapter**
  Créer `src/infra/database/repositories/share-link.repository.adapter.ts`. Implémenter : `create(data)`, `findByToken(token)`, `findByDocumentId(docId)`, `revoke(id)`, `revokeAllForDocument(docId)`, `incrementAccessCount(id)`.
  **Ref :** `09-database-persistence-blueprint.md §1 ShareLink`

- [ ] **Ticket 5.7 — Route POST /api/v1/documents/:id/share**
  Créer `src/modules/share/interfaces/http/share.routes.ts`. `POST /:id/share` : valider `{ expiresIn: '24h' | '7d' | '30d' }`, révoquer l'éventuel lien existant (invariant : 1 lien actif max), générer token `randomBytes(32).toString('base64url')`, create ShareLink, retourner `{ shareUrl, token, expiresAt }`.
  **Ref :** `07-api-contract.md §3 POST /documents/:id/share` · `02-product-requirements-document.md §7 F4`

- [ ] **Ticket 5.8 — Route DELETE /api/v1/share/:linkId (révocation)**
  `DELETE /share/:linkId` : ownership check (via userId sur ShareLink), `isRevoked = true`, return 204.
  **Ref :** `07-api-contract.md §3 DELETE /share/:linkId`

- [ ] **Ticket 5.9 — Route GET /s/:token (accès public sans auth)**
  Route **hors prefix** `/api/v1`. Lookup ShareLink par token, vérifier `!isRevoked` et `expiresAt > now()`, incrémenter `accessCount`, générer presigned GET URL S3, retourner `{ document: { title, mimeType }, downloadUrl }`. Si expiré/révoqué → 404 avec message explicite.
  **Ref :** `07-api-contract.md §3 GET /s/:token` · `03-technical-design-document.md §8`

- [ ] **Ticket 5.10 — Route GET /api/v1/ocr/process (proxy OCR mobile)**
  `POST /ocr/process` : route authentifiée. Accepter `{ document_id, file_base64, mime_type }`, vérifier ownership, appeler `MistralOcrAdapter`, retourner `{ ocr_text, confidence }`. **La clé Mistral ne quitte jamais le backend.**
  **Ref :** `03-technical-design-document.md §6` · `08-ui-component-blueprint.md useSyncService._callOcrWithRetry`

**🧪 TDD checkpoint Phase 5** : Test sync push avec LWW (conflict + skip). Test pull `since=0` retourne tout. Test lien expiré → 404. Test double share sur même doc → révoque le premier. Test OCR proxy avec mock Mistral.

---

## Phase 6 — Frontend Init & Auth Mobile

> **Objectif** : Nuxt 3 SPA configuré pour Capacitor, pages login/register fonctionnelles avec JWT persisté.

- [ ] **Ticket 6.1 — Init Nuxt 3 + configuration SPA**
  Créer le projet Nuxt 3 dans `/mobile` : `npx nuxi@latest init`. Configurer `nuxt.config.ts` : `ssr: false`, `app.baseURL: '/'`. Installer Tailwind CSS (`@nuxtjs/tailwindcss`), Pinia (`@pinia/nuxt`), `@vueuse/core`. Configurer `tsconfig.json` strict.
  **Ref :** `08-ui-component-blueprint.md §1.2`

- [ ] **Ticket 6.2 — Design tokens Tailwind**
  Créer `tailwind.config.ts`. Déclarer les couleurs sémantiques : `tidy-primary`, `tidy-surface`, `tidy-border`, `tidy-text-*`, `tidy-status-*`. Déclarer l'animation custom `animate-status-pulse` (keyframes pulsation douce). Créer `assets/css/components.css` avec `.badge-status` et `.card-base` via `@apply`.
  **Ref :** `08-ui-component-blueprint.md §1.3`

- [ ] **Ticket 6.3 — Composable $tidyApi (HTTP client)**
  Créer `composables/useTidyApi.ts`. Wrapper autour de `$fetch` Nuxt : injecter `Authorization: Bearer` depuis `useAuthStore`, gérer le refresh automatique sur 401 (retry une fois après refresh), gérer les erreurs réseau (offline → ne pas throw, retourner null).
  **Ref :** `08-ui-component-blueprint.md §4 useSyncService`

- [ ] **Ticket 6.4 — useAuthStore (Pinia)**
  Créer `stores/auth.store.ts`. State : `accessToken`, `refreshToken`, `user`. Actions : `login(email, password)`, `register(email, password, displayName)`, `refreshTokens()`, `logout()`. Persister `accessToken` et `refreshToken` via `@capacitor-community/secure-storage`. Getter `isAuthenticated`.
  **Ref :** `08-ui-component-blueprint.md §4` · `07-api-contract.md §1`

- [ ] **Ticket 6.5 — Middleware auth.global.ts**
  Créer `middleware/auth.global.ts`. Vérifier `useAuthStore().isAuthenticated`. Si non → `navigateTo('/auth/login')`. Exclure les routes `/auth/*` et `/s/*`. Tenter un `refreshTokens()` silencieux si `accessToken` expiré avant de rediriger.
  **Ref :** `08-ui-component-blueprint.md §2.3`

- [ ] **Ticket 6.6 — Page auth/login.vue**
  Créer `pages/auth/login.vue`. Formulaire : email + password + bouton "Se connecter". Appeler `useAuthStore().login()`. En cas de succès → naviguer vers `/`. En cas d'erreur → afficher message inline (pas de toast). Lien "Créer un compte" → `/auth/register`.
  **Ref :** `08-ui-component-blueprint.md §2.2` · `06-ux-flow.md §3`

- [ ] **Ticket 6.7 — Page auth/register.vue**
  Créer `pages/auth/register.vue`. Formulaire : displayName + email + password. Appeler `useAuthStore().register()`. En cas de succès → naviguer vers `/`. Lien "Déjà un compte" → `/auth/login`.
  **Ref :** `08-ui-component-blueprint.md §2.2` · `06-ux-flow.md §2 Acte 1`

- [ ] **Ticket 6.8 — Page index.vue (redirect guard)**
  Créer `pages/index.vue`. `onMounted` : si non authentifié → `/auth/login`. Si authentifié → charger workspaces → naviguer vers `/workspace/${workspaces[0].id}`.
  **Ref :** `08-ui-component-blueprint.md §2.4`

**🧪 TDD checkpoint Phase 6** : Test composant `LoginForm` avec mock store. Test middleware redirect sur route protégée. Test persist token en SecureStorage.

---

## Phase 7 — Frontend Workspace & Dashboard

> **Objectif** : Dashboard opérationnel avec liste de documents, polling statut, états vide/chargement/erreur.

- [ ] **Ticket 7.1 — useWorkspaceStore (Pinia)**
  Créer `stores/workspace.store.ts`. State : `workspaces[]`, `currentWorkspaceId`. Actions : `fetchWorkspaces()`, `createWorkspace(name, description)`, `updateWorkspace(id, data)`, `setCurrentWorkspace(id)`. Appels via `$tidyApi`.
  **Ref :** `08-ui-component-blueprint.md §3.2 WorkspaceSelector`

- [ ] **Ticket 7.2 — Middleware workspace.ts**
  Créer `middleware/workspace.ts`. Vérifier que `workspaceId` de l'URL appartient au user (via `useWorkspaceStore`). Sinon → naviguer vers `/`.
  **Ref :** `08-ui-component-blueprint.md §2.3`

- [ ] **Ticket 7.3 — WorkspaceSelector.vue (Smart)**
  Créer `components/WorkspaceSelector.vue`. Afficher la liste des workspaces (dropdown ou modal bottom sheet). Naviguer directement via `useRouter` au changement. Option "Nouveau workspace" → modal de création.
  **Ref :** `08-ui-component-blueprint.md §3.2`

- [ ] **Ticket 7.4 — Composants Dumb : DocumentStatusBadge + TagChip**
  Créer `components/DocumentStatusBadge.vue` : mapping `ProcessingStatus` → label UX + couleur Tailwind (table de mapping exacte du blueprint). Créer `components/TagChip.vue` : props `label`, `variant: 'user' | 'suggested'`, `removable`, event `remove`.
  **Ref :** `08-ui-component-blueprint.md §3.3`

- [ ] **Ticket 7.5 — Composant Dumb : ThumbnailPreview + DocumentCard**
  Créer `components/ThumbnailPreview.vue` : afficher l'image si `thumbnailUrl` non null, sinon icône fallback selon `mimeType`. Créer `components/DocumentCard.vue` : props `document: DocumentListItem`, émet `click`. Composer avec ThumbnailPreview + DocumentStatusBadge + TagChip.
  **Ref :** `08-ui-component-blueprint.md §3.3`

- [ ] **Ticket 7.6 — Composants Dumb : SkeletonLoader + EmptyState + ErrorState**
  Créer `components/SkeletonLoader.vue` (props : variant, count). Créer `components/EmptyState.vue` (props : context, query) + event `primaryAction`. Créer `components/ErrorState.vue` (props : context, retryable) + event `retry`.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §3.1`

- [ ] **Ticket 7.7 — useDocumentStore (Pinia) — partie liste**
  Créer `stores/document.store.ts`. State : `documents[]`, `isLoading`, `error`, `pollingInterval`. Actions : `fetchDocuments(workspaceId, filters)`, `startPolling(workspaceId)` (setInterval 5s si docs en traitement), `stopPolling()`.
  **Ref :** `08-ui-component-blueprint.md §3.2 DocumentList` · `06-ux-flow.md §5`

- [ ] **Ticket 7.8 — DocumentList.vue (Smart) + polling**
  Créer `components/DocumentList.vue`. `onMounted` : fetch documents + démarrer polling si needed. `onUnmounted` : arrêter polling. Gérer les 3 états visuels : loading (SkeletonLoader) / empty (EmptyState) / error (ErrorState). Infinite scroll avec `useIntersectionObserver` (pagination page + 1 au scroll).
  **Ref :** `08-ui-component-blueprint.md §3.2` · `06-ux-flow.md §5`

- [ ] **Ticket 7.9 — Page Dashboard /workspace/[workspaceId]/index.vue**
  Créer `pages/workspace/[workspaceId]/index.vue`. Layout : SearchBar en header, WorkspaceSelector, DocumentList. Bouton FAB "Ajouter un document" → naviguer vers `/workspace/:id/upload`. Bouton discret "Actualiser" → `documentStore.fetchDocuments()`.
  **Ref :** `06-ux-flow.md §3.1` · `08-ui-component-blueprint.md §2.2`

**🧪 TDD checkpoint Phase 7** : Test DocumentCard render avec statut ENRICHED → badge vert. Test statut PROCESSING → badge pulsant. Test polling : stop au unmount. Test EmptyState sur workspace vide.

---

## Phase 8 — Frontend Document UI (Upload, Détail, Édition)

> **Objectif** : flux d'upload complet, vue détail avec sections IA/user séparées, édition métadonnées, retry.

- [ ] **Ticket 8.1 — UploadProgressBar.vue (Dumb)**
  Créer `components/UploadProgressBar.vue`. Props : `progress (0-100)`, `filename`, `status: 'uploading' | 'success' | 'error'`, `errorMessage`. Event `retry`. Ce composant n'existe QUE dans `/upload` — jamais dans la liste Dashboard.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §3.2 règle critique`

- [ ] **Ticket 8.2 — UploadDropzone.vue (Smart) + page /upload**
  Créer `components/UploadDropzone.vue`. Valider MIME (pdf/jpeg/png) + taille (≤ 50 Mo) côté client. Appeler `documentStore.uploadDocument()` avec `XMLHttpRequest` (pour le progress). Afficher UploadProgressBar. En succès → naviguer vers `/workspace/:id`. Créer `pages/workspace/[workspaceId]/upload.vue`.
  **Ref :** `08-ui-component-blueprint.md §3.2` · `06-ux-flow.md §3.2`

- [ ] **Ticket 8.3 — useDocumentStore — actions document unique**
  Étendre `document.store.ts`. Ajouter : `fetchDocument(id)`, `updateDocument(id, metadata)`, `archiveDocument(id)`, `reprocessDocument(id)`, `deleteDocument(id)`, `uploadDocument(workspaceId, file)`. State : `currentDocument`.
  **Ref :** `08-ui-component-blueprint.md §3.2 DocumentDetail`

- [ ] **Ticket 8.4 — Composants Dumb : IntelligenceSection + UserMetadataSection**
  Créer `components/IntelligenceSection.vue` : READ ONLY, afficher `detectedType` + entités extraites + `suggestedTags`. Event `addSuggestedTag`, `requestTypeOverride`. Afficher "Détection incertaine" si `globalConfidenceScore < 0.6`. Créer `components/UserMetadataSection.vue` : éditée selon prop `editMode`, events `addTag`, `removeTag`, `updateNotes`.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §3.3`

- [ ] **Ticket 8.5 — TypeOverrideDropdown.vue + TagChip actions**
  Créer `components/TypeOverrideDropdown.vue` : dropdown avec les 6 types, labels UX (jamais les valeurs enum brutes). Event `override`. Étendre `TagChip.vue` si nécessaire pour le bouton "Ajouter à mes tags" depuis `IntelligenceSection`.
  **Ref :** `08-ui-component-blueprint.md §3.3`

- [ ] **Ticket 8.6 — DocumentDetail.vue (Smart)**
  Créer `components/DocumentDetail.vue`. `onMounted` : `fetchDocument(id)`. Composer IntelligenceSection + UserMetadataSection + thumbnail + titre inline-edit + bouton Archiver + lien Modifier + bouton Télécharger (presigned URL). Gérer l'état FAILED (afficher FailedDocumentActions).
  **Ref :** `08-ui-component-blueprint.md §3.2` · `06-ux-flow.md §3.3`

- [ ] **Ticket 8.7 — FailedDocumentActions.vue + page /document/[id]**
  Créer `components/FailedDocumentActions.vue` : bouton "Relancer l'analyse" → `reprocessDocument()`, lien "Ignorer". Créer `pages/workspace/[workspaceId]/document/[documentId]/index.vue` utilisant `DocumentDetail`.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §3.6`

- [ ] **Ticket 8.8 — Page /document/[id]/edit.vue**
  Créer `pages/workspace/[workspaceId]/document/[documentId]/edit.vue`. Formulaire : titre, tags personnels (TagChip + input), notes, TypeOverrideDropdown. Appeler `documentStore.updateDocument()`. Toast discret "Modifications enregistrées" en succès. Bouton Annuler → retour.
  **Ref :** `06-ux-flow.md §3.5` · `07-api-contract.md §3 PATCH /documents/:id`

**🧪 TDD checkpoint Phase 8** : Test IntelligenceSection : données IA jamais modifiables en direct. Test upload fichier > 50 Mo → message erreur sans appel API. Test reprocess sur doc ENRICHED → bouton absent.

---

## Phase 9 — Frontend Search

> **Objectif** : recherche full-text opérationnelle avec filtres, résultats depuis l'API (pas de live search en MVP).

- [ ] **Ticket 9.1 — useSearchStore (Pinia)**
  Créer `stores/search.store.ts`. State : `query`, `results[]`, `filters: SearchFilters`, `isLoading`. Actions : `search(workspaceId, query, filters)` → appel `GET /documents/search`. `clearSearch()`. `setFilter(key, value)`.
  **Ref :** `08-ui-component-blueprint.md §3.2 SearchResults`

- [ ] **Ticket 9.2 — SearchBar.vue (Dumb) + intégration header**
  Créer `components/SearchBar.vue`. Input texte + icône loupe. Déclencher event `search` à la soumission (Enter ou clic loupe) — PAS en live. Event `clear`. Intégrer dans le layout du Dashboard et de la page search.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §6`

- [ ] **Ticket 9.3 — TagFilterBar.vue (Dumb)**
  Créer `components/TagFilterBar.vue`. Afficher chips : types (INVOICE, CONTRACT…), tags personnels, plage date. Filtres cumulables. Bouton "Effacer les filtres". Event `filterChange`, `clearAll`.
  **Ref :** `08-ui-component-blueprint.md §3.3` · `06-ux-flow.md §6`

- [ ] **Ticket 9.4 — SearchResults.vue (Smart) + page /search**
  Créer `components/SearchResults.vue`. Afficher `useSearchStore.results` avec surlignage des termes (`ts_headline` retourné par l'API). Intégrer TagFilterBar. Gérer état vide + erreur. Créer `pages/workspace/[workspaceId]/search.vue`.
  **Ref :** `08-ui-component-blueprint.md §3.2` · `06-ux-flow.md §3.4`

**🧪 TDD checkpoint Phase 9** : Test SearchBar n'émet pas `search` à chaque frappe. Test TagFilterBar : filtre cumulatif. Test SearchResults état vide.

---

## Phase 10 — Frontend SQLite & Offline Base

> **Objectif** : base SQLite chiffrée initialisée, migrations, CRUD local, FTS5 opérationnel. Prérequis au Sync Service.

- [ ] **Ticket 10.1 — Setup Capacitor + plugins natifs**
  Installer `@capacitor/core`, `@capacitor/cli`. Créer `capacitor.config.ts`. Installer les plugins : `@capawesome/capacitor-sqlite`, `@capacitor-community/secure-storage`, `@capacitor/filesystem`, `@capacitor/camera`, `@capacitor/network`, `@capacitor/share`, `@capacitor/app`. Synchroniser iOS et Android : `npx cap sync`.
  **Ref :** `03-technical-design-document.md §2.2`

- [ ] **Ticket 10.2 — useSecureStorage composable**
  Créer `composables/useSecureStorage.ts`. Wrapper `@capacitor-community/secure-storage`. Méthodes : `setItem(key, value)`, `getItem(key)`, `removeItem(key)`. Utiliser iOS Keychain / Android Keystore automatiquement via le plugin.
  **Ref :** `03-technical-design-document.md §2.2`

- [ ] **Ticket 10.3 — useDatabaseService (init + migrations)**
  Créer `composables/useDatabaseService.ts`. Initialiser `@capawesome/capacitor-sqlite` avec chiffrement AES-256 (clé générée au premier lancement, stockée via `useSecureStorage`). Implémenter le runner de migrations (`schema_version` dans `app_state`). Appliquer le DDL complet (tables `documents`, `share_links`, `sync_log`, `app_state`, `local_logs`, FTS5, triggers, index).
  **Ref :** `03-technical-design-document.md §3.1` · `03-technical-design-document.md §3.2`

- [ ] **Ticket 10.4 — DocumentRepository local (CRUD SQLite)**
  Créer `composables/useLocalDocumentRepository.ts`. Implémenter : `insertDocument(doc)`, `getDocumentById(id)`, `getAllDocuments(workspaceId, filters)`, `updateDocument(id, fields)`, `softDeleteDocument(id)`, `getPendingOcrDocuments()`, `upsertDocumentFromCloud(cloudDoc)` (LWW local).
  **Ref :** `03-technical-design-document.md §3.1`

- [ ] **Ticket 10.5 — FTS5 Search local**
  Ajouter dans `useLocalDocumentRepository.ts` la méthode `searchDocuments(workspaceId, query)` : requête FTS5 `documents_fts MATCH ?` avec tokenizer unicode61. Les triggers SQLite maintiennent l'index automatiquement à chaque INSERT/UPDATE/DELETE.
  **Ref :** `03-technical-design-document.md §3.1 FTS5`

- [ ] **Ticket 10.6 — useFileSystem composable (chiffrement natif)**
  Créer `composables/useFileSystem.ts`. Wrapper `@capacitor/filesystem`. Méthodes : `saveEncryptedFile(documentId, buffer, extension)` → chiffrement AES-256-GCM via plugin natif (IV aléatoire + AuthTag), `readDecryptedFile(localPath)`, `readRawFile(localPath)` (pour l'upload S3 : envoi du ciphertext brut), `deleteFile(localPath)`. **Ne jamais chiffrer en JS WebView.**
  **Ref :** `03-technical-design-document.md §2.1` · `03-technical-design-document.md §4.1`

- [ ] **Ticket 10.7 — useLocalSearchStore (Pinia offline)**
  Étendre ou créer un store de recherche locale. `searchOffline(workspaceId, query)` → appel `useLocalDocumentRepository.searchDocuments()`. Utilisé en fallback quand `@capacitor/network` indique offline.
  **Ref :** `03-technical-design-document.md §3.1` · `02-product-requirements-document.md §7 F2`

**🧪 TDD checkpoint Phase 10** : Test migrations idempotentes (run 2x = pas d'erreur). Test insert + FTS5 search trouve le bon document. Test chiffrement : fichier lu déchiffré = original. Test offline search sans réseau.

---

## Phase 11 — Frontend Sync Service

> **Dépendance critique** : ne pas commencer avant que `POST /documents/sync` (Phase 5) et `GET /documents/sync?since=` (Phase 5) soient déployés et testés.

- [ ] **Ticket 11.1 — useSyncService (structure + pull)**
  Créer `composables/useSyncService.ts`. Implémenter `triggerAsync(workspaceId)` (fire-and-forget, guard `_isSyncing`). Implémenter `pullFromCloud(workspaceId)` : lire `last_sync_at` depuis `app_state`, appeler `GET /documents/sync?since=`, upsert chaque doc reçu, mettre à jour `last_sync_at`.
  **Ref :** `08-ui-component-blueprint.md useSyncService` · `03-technical-design-document.md §2.5`

- [ ] **Ticket 11.2 — useSyncService : OCR queue**
  Implémenter `processOcrQueue()` dans `useSyncService.ts`. Fetch `getPendingOcrDocuments()`, traitement séquentiel (1 à la fois — pas de parallélisme). Pour chaque doc : lire + déchiffrer fichier, appeler `POST /ocr/process`, mettre à jour `ocr_text` + `ocr_status` en SQLite. Retry avec backoff (3 tentatives, 2s/8s/32s).
  **Ref :** `08-ui-component-blueprint.md useSyncService._processOcr`

- [ ] **Ticket 11.3 — useSyncService : upload fichiers vers S3**
  Implémenter `uploadPendingFiles()`. Fetch `sync_log` entries `operation='upload'` + sans `cloud_key`. Pour chaque : POST `/files/upload-url`, lire le fichier **chiffré brut** (`readRawFile`), PUT vers S3 presigned URL, mettre à jour `cloud_key + sync_status = synced` en SQLite.
  **Ref :** `08-ui-component-blueprint.md useSyncService._uploadFile`

- [ ] **Ticket 11.4 — useSyncService : push metadata vers backend**
  Implémenter `pushToCloud()`. Fetch `sync_log` entries `operation='update_meta' | 'delete'`. Batch POST `/documents/sync`. Traiter les résultats (created/updated/skipped). Marquer les entries `sync_log` comme `done`.
  **Ref :** `08-ui-component-blueprint.md useSyncService.pushToCloud`

- [ ] **Ticket 11.5 — sync_log CRUD + SyncLogRepository local**
  Créer les méthodes dans `useDatabaseService` ou un composable dédié : `addSyncLogEntry(documentId, operation)`, `getPendingSyncLogEntries()`, `updateSyncLogEntry(id, status, errorMessage?)`, `getSyncLogByDocument(docId)`.
  **Ref :** `03-technical-design-document.md §3.1 sync_log`

- [ ] **Ticket 11.6 — Network Listener (Capacitor Network)**
  Créer `composables/useNetworkListener.ts`. Écouter `@capacitor/network` `networkStatusChange`. Quand réseau disponible → `useSyncService().triggerAsync(currentWorkspaceId)`. Enregistrer le listener dans le plugin Nuxt ou dans `app.vue` `onMounted`.
  **Ref :** `03-technical-design-document.md §2.5`

- [ ] **Ticket 11.7 — App Lifecycle (Capacitor App)**
  Créer `composables/useAppLifecycle.ts`. Écouter `@capacitor/app` `appStateChange`. En `isActive = true` (foreground) : si réseau disponible → déclencher sync. En background : marquer documents `ocr_status='processing'` → `'pending'` (suspend OCR). Au démarrage : scanner `ocr_status='pending'` + `sync_status='pending'` → reprendre.
  **Ref :** `03-technical-design-document.md §2.5`

- [ ] **Ticket 11.8 — Intégration Sync dans DocumentStore offline**
  Dans `document.store.ts` : ajouter `refreshFromDatabase(workspaceId)` (reload depuis SQLite vers le store après une sync). Appeler après chaque cycle `syncAll()`. Mettre à jour `useLocalSearchStore` si des documents ont changé.
  **Ref :** `08-ui-component-blueprint.md useSyncService.syncAll`

**🧪 TDD checkpoint Phase 11** : Test pull → documents apparaissent en SQLite. Test upload S3 avec mock presigned URL. Test offline : sync silencieuse au retour réseau. Test LWW : doc serveur plus récent → SQLite mis à jour.

---

## Phase 12 — Frontend Share Feature

> **Dépendance** : Phase 5 (routes share backend) terminée.

- [ ] **Ticket 12.1 — useShareStore (Pinia)**
  Créer `stores/share.store.ts`. State : `activeShareLink` par `documentId`. Actions : `createShareLink(documentId, expiresIn)` → `POST /documents/:id/share`, `revokeShareLink(linkId)` → `DELETE /share/:linkId`. Getter `getShareLink(documentId)`.
  **Ref :** `07-api-contract.md §3 Module Share`

- [ ] **Ticket 12.2 — ShareModal.vue (Dumb) + intégration DocumentDetail**
  Créer `components/ShareModal.vue`. Bottom sheet ou modal : sélecteur durée (24h / 7j / 30j), bouton "Générer le lien", affichage du lien avec bouton "Copier", bouton "Révoquer". Intégrer le bouton "Partager" dans `DocumentDetail.vue`.
  **Ref :** `06-ux-flow.md §3 Flow 4` · `08-ui-component-blueprint.md`

- [ ] **Ticket 12.3 — Partage natif (Capacitor Share)**
  Dans `ShareModal.vue` : après génération du lien, proposer "Envoyer via..." → appeler `@capacitor/share` `share({ url })` pour ouvrir la share sheet native iOS/Android.
  **Ref :** `03-technical-design-document.md §2.4`

**🧪 TDD checkpoint Phase 12** : Test génération lien → URL copiable. Test révocation depuis l'UI. Test share sheet native (mock Capacitor).

---

## Phase 13 — Capacitor Native & OCR Mobile

> **Objectif** : scan caméra, détection de bords, import depuis apps tierces (share extension).

- [ ] **Ticket 13.1 — Page /scan + Capacitor Camera**
  Créer `pages/workspace/[workspaceId]/scan.vue`. Utiliser `@capacitor/camera` `getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Base64 })`. Afficher la photo capturée. Valider le format. Convertir en File + appeler `documentStore.uploadDocument()`.
  **Ref :** `03-technical-design-document.md §2.3` · `08-ui-component-blueprint.md §2.2`

- [ ] **Ticket 13.2 — Détection de bords (OpenCV.js / Dynamsoft)**
  Intégrer `opencv.js` (chargé lazily). Sur la page scan : après capture, passer l'image dans le détecteur de bords. Afficher des points de contrôle ajustables. Permettre le recadrage manuel avant confirmation. Appliquer la transformation perspective.
  **Ref :** `03-technical-design-document.md §2.3 Option A`

- [ ] **Ticket 13.3 — iOS Share Extension**
  Dans le projet Xcode : créer une Share Extension target. Configurer `App Group` partagé entre l'extension et l'app principale. Handler : copier le fichier reçu dans le group container. Dans `useAppLifecycle.ts` : au foreground, vérifier le group container et importer automatiquement les fichiers en attente.
  **Ref :** `03-technical-design-document.md §2.4 iOS`

- [ ] **Ticket 13.4 — Android Intent Filter**
  Dans `AndroidManifest.xml` : déclarer `intent-filter` avec `action.SEND` pour MIME types `application/pdf`, `image/jpeg`, `image/png`. Dans l'activité principale : lire l'intent, copier le fichier dans le sandbox app, déclencher l'import via `useSyncService`.
  **Ref :** `03-technical-design-document.md §2.4 Android`

- [ ] **Ticket 13.5 — LogService local (SQLite)**
  Créer `composables/useLogService.ts`. Écrire dans la table `local_logs` (DDL dans Phase 10). Niveaux : debug/info/warn/error. Contextes : OCR/SYNC/CRYPTO/SHARE/UI. Purge auto des logs > 7 jours. **Les logs ne quittent jamais le device.**
  **Ref :** `03-technical-design-document.md §11.1`

- [ ] **Ticket 13.6 — Sentry SDK Capacitor**
  Installer `@sentry/capacitor`. Configurer dans `app.vue` `onMounted` avec le DSN Sentry. **Exclure explicitement** `ocr_text` et `original_filename` des breadcrumbs (RGPD). Tester la remontée d'une erreur de test.
  **Ref :** `03-technical-design-document.md §11.3`

**🧪 TDD checkpoint Phase 13** : Test scan → fichier importé dans SQLite. Test intent Android avec mock. Test log purge auto.

---

## Phase 14 — QA, Polish & Release Prep

> **Objectif** : critères d'acceptation du PRD tous validés. App store ready.

- [ ] **Ticket 14.1 — Validation critères d'acceptation PRD**
  Vérifier manuellement les 10 critères du PRD §12 : CA1 (scan → recherche < 10s offline), CA2 (import PDF share sheet), CA3 (search < 1s sur Android ≤ 3 Go RAM), CA4 (partage + révocation), CA5 (mode avion), CA6 (100 cycles sync partielle sans perte), CA7 (chiffrement vérifié), CA8 (iOS 16 + Android 11), CA9 (quota Free 30 docs), CA10 (OCR ≥ 85%).
  **Ref :** `02-product-requirements-document.md §12`

- [ ] **Ticket 14.2 — Tests E2E Flow complet (Vitest + mocks Capacitor)**
  Écrire des tests E2E couvrant : register → upload → polling status ENRICHED → search → share → revoke. Mocker les plugins Capacitor natifs pour les tests CI.
  **Ref :** `02-product-requirements-document.md §12`

- [ ] **Ticket 14.3 — Test performance device Android entrée de gamme**
  Tester sur device physique Android ≤ 3 Go RAM (ou émulateur configuré) : search FTS local < 1s (NFR1), chiffrement fichier 10 Mo < 3s (NFR4), cold start < 2s (NFR3). Corriger les bottlenecks identifiés.
  **Ref :** `02-product-requirements-document.md §8 NFR` · `03-technical-design-document.md §2.6`

- [ ] **Ticket 14.4 — Tier enforcement (Free 30 docs)**
  Côté backend : dans `POST /documents`, vérifier `user.tier === 'FREE'` + `count(documents WHERE uploadedById = userId AND isDeleted = false)`. Si ≥ 30 → 422 avec code `DOCUMENT_QUOTA_EXCEEDED`. Côté mobile : afficher un banner/upsell Pro si quota proche (≥ 25).
  **Ref :** `02-product-requirements-document.md §7 F3.9` · `07-api-contract.md §1`

- [ ] **Ticket 14.5 — Cron job : purge S3 des soft-deleted**
  Créer un job Node.js `src/jobs/purge-deleted-documents.job.ts`. Query PostgreSQL : `isDeleted = true AND syncedAt < NOW() - INTERVAL '24 hours'`. Pour chaque : `s3.deleteObject(s3Key)` + `s3.deleteObject(thumbnailRef)`. Scheduler via `setInterval` au démarrage ou cron externe.
  **Ref :** `07-api-contract.md §3 DELETE /documents/:id`

- [ ] **Ticket 14.6 — Rate limiting + sécurité headers**
  Installer `@fastify/rate-limit` : 100 req/min par IP sur toutes les routes, 10 req/min sur `/auth/*`. Installer `@fastify/helmet` pour les security headers. Configurer CORS pour l'app mobile (`Origin: capacitor://localhost`).
  **Ref :** `03-technical-design-document.md §9` · `07-api-contract.md §1 429`

- [ ] **Ticket 14.7 — Variables d'environnement + secrets review**
  Auditer toutes les variables d'env. S'assurer que `MISTRAL_API_KEY` et `JWT_SECRET` ne sont JAMAIS dans le code ni dans le bundle mobile. Documenter le `.env.example` final. Configurer les secrets dans le CI (GitHub Secrets).
  **Ref :** `03-technical-design-document.md §9.4`

- [ ] **Ticket 14.8 — App store metadata + build iOS/Android**
  Configurer `capacitor.config.ts` avec `appId`, `appName`. Générer les icônes et splash screens. Build iOS : `npx cap build ios`. Build Android : `npx cap build android`. Tester sur un device physique iOS 16+ et Android 11+.
  **Ref :** `03-technical-design-document.md §2.1`

---

## Récapitulatif des Dépendances Critiques

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
                │                                   │
                └──► Phase 6 ──► Phase 7 ──► Phase 8 ──► Phase 12
                                      │
                                      └──► Phase 9
                │
                └──► Phase 10 ──► Phase 11 ◄─────── Phase 5
                                      │
                                      └──► Phase 13 ──► Phase 14
```

> **⚠️ Règle absolue** : `useSyncService` (Phase 11) ne peut pas appeler `POST /documents/sync` et `GET /documents/sync?since=` avant que ces endpoints soient déployés et testés (Phase 5 complète).

---

## Checklist de Validation Finale (Definition of Done MVP)

- [ ] Les 10 critères d'acceptation du PRD §12 sont tous validés manuellement
- [ ] Aucun `any` TypeScript dans le codebase (frontend + backend)
- [ ] Couverture tests backend ≥ 70% sur les modules Auth, Document, Sync, Share
- [ ] La CI GitHub Actions passe sur `main`
- [ ] Le chiffrement local est vérifié (fichier SQLite inlisible hors app)
- [ ] Aucune donnée utilisateur (email, OCR text) dans les logs Sentry
- [ ] La clé Mistral API n'est pas dans le bundle mobile (vérifiable via `strings` sur l'IPA/APK)
- [ ] Build iOS et Android testés sur device physique
- [ ] OCR ≥ 85% validé sur un corpus de 50 documents terrain
