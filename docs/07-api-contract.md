# API Contract — GED Intelligente MVP
**Version** : 1.0
**Backend** : Node.js + Fastify
**Architecture** : Monolithe Modulaire
**Style** : REST
**Dernière mise à jour** : Mars 2026

---

## Hypothèses documentées

Les hypothèses suivantes ont été posées en l'absence de spécification explicite :

- `multipart/form-data` est utilisé pour l'upload de fichier (pas de presigned URL côté client au MVP)
- Le `title` du document est optionnel à l'upload — l'`originalFilename` est utilisé comme fallback
- Les types détectés (`detectedType`) suivent l'enum : `INVOICE | CONTRACT | RECEIPT | ID_DOCUMENT | BANK_STATEMENT | OTHER`
- Le refresh token est rotatif à chaque usage (invalidé et remplacé)
- La pagination par défaut est de 30 éléments par page, ordre décroissant par `uploadedAt`
- L'endpoint `PATCH /documents/:id` ne permet PAS de modifier `processingStatus` directement — uniquement les champs `DocumentMetadata`
- Les `ProcessingEvent` sont exposés en lecture seule via `GET /documents/:id` (imbriqués dans la réponse)

---

## 1. Principes Généraux

### Style REST

- Ressources nommées au pluriel : `/documents`, `/workspaces`
- Verbes HTTP sémantiques : `GET` (lecture), `POST` (création), `PATCH` (mise à jour partielle), `DELETE` (suppression)
- Pas de verbes dans les URLs sauf pour les actions non-CRUD explicites (`/reprocess`)
- Toutes les mutations retournent la ressource mise à jour dans `data`

### Versioning

Toutes les routes sont préfixées par `/api/v1`.

Base URL : https://api.ged.io/api/v1

### Authentification

JWT Bearer Token sur toutes les routes sauf :
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`

Header attendu :
Authorization: Bearer <access_token>

- **Access token** : durée de vie 1 heure
- **Refresh token** : durée de vie 30 jours, rotation à chaque usage
- **Payload JWT** : `{ sub: userId, tier: "free" | "pro", iat, exp }`
- **Algorithme** : HS256 (MVP) → RS256 recommandé V2 (multi-instance)

### Format des réponses

Toutes les réponses (succès et erreurs) respectent la structure standard définie en section 2.

### Codes HTTP utilisés

| Code | Signification |
|------|---------------|
| `200` | Succès — réponse avec données |
| `201` | Créé — ressource créée avec succès |
| `204` | Succès — pas de contenu (ex : DELETE) |
| `400` | Requête invalide — erreur de validation |
| `401` | Non authentifié — token absent ou expiré |
| `403` | Non autorisé — ressource appartenant à un autre User |
| `404` | Ressource introuvable |
| `409` | Conflit — ex : email déjà utilisé, nom de workspace dupliqué |
| `413` | Payload trop volumineux — fichier > 50 Mo |
| `415` | Type MIME non supporté |
| `422` | Entité non traitable — données valides syntaxiquement mais invalides métier |
| `429` | Trop de requêtes — rate limiting déclenché |
| `500` | Erreur interne serveur |
| `503` | Service externe indisponible (ex : Mistral OCR) |

### Pagination

Paramètres de query standards pour toutes les listes :

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `page` | `integer` | `1` | Numéro de page (base 1) |
| `limit` | `integer` | `30` | Éléments par page (max : 100) |

Réponse systématique dans `meta` :

```json
"meta": {
  "page": 1,
  "limit": 30,
  "total": 142,
  "totalPages": 5,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

### Filtrage et tri

Les paramètres de filtrage sont passés en query string.
Le tri est contrôlé par `sortBy` et `sortOrder` :

GET /api/v1/documents?sortBy=uploadedAt&sortOrder=desc

Valeurs `sortOrder` : `asc` | `desc` (défaut : `desc`).

---

## 2. Modèle de Réponse Standard

### Structure uniforme

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

### Conventions

| Champ | Présence | Description |
|-------|----------|-------------|
| `data` | Toujours présent | Contient la ressource ou la liste. `null` sur erreur ou `204`. |
| `meta` | Présent si liste paginée, sinon `{}` | Informations de pagination et contexte |
| `error` | `null` sur succès, objet sur erreur | Détail structuré de l'erreur |

### Réponse succès — ressource unique

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Facture Adobe Systems — Janvier 2025"
  },
  "meta": {},
  "error": null
}
```

### Réponse succès — liste paginée

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 30,
    "total": 142,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  },
  "error": null
}
```

### Réponse erreur

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "Le document demandé n'existe pas ou ne vous appartient pas.",
    "details": []
  }
}
```

### Erreur de validation (400)

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Les données fournies sont invalides.",
    "details": [
      {
        "field": "email",
        "message": "L'email doit être une adresse valide."
      },
      {
        "field": "password",
        "message": "Le mot de passe doit contenir au moins 8 caractères."
      }
    ]
  }
}
```

### Codes d'erreur métier (`error.code`)

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Échec de validation JSON Schema |
| `INVALID_CREDENTIALS` | 401 | Email ou mot de passe incorrect |
| `TOKEN_EXPIRED` | 401 | Access token expiré |
| `TOKEN_INVALID` | 401 | Token malformé ou signature invalide |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token invalide ou révoqué |
| `FORBIDDEN` | 403 | Accès refusé à une ressource d'un autre User |
| `DOCUMENT_NOT_FOUND` | 404 | Document introuvable |
| `WORKSPACE_NOT_FOUND` | 404 | Workspace introuvable |
| `USER_NOT_FOUND` | 404 | Utilisateur introuvable |
| `EMAIL_ALREADY_EXISTS` | 409 | Email déjà utilisé |
| `WORKSPACE_NAME_DUPLICATE` | 409 | Nom de workspace déjà utilisé pour ce User |
| `WORKSPACE_ARCHIVED` | 422 | Action impossible — Workspace archivé |
| `DOCUMENT_NOT_READY` | 422 | Action impossible — Document pas dans l'état requis |
| `INVALID_STATUS_TRANSITION` | 422 | Transition d'état invalide |
| `FILE_TOO_LARGE` | 413 | Fichier > 50 Mo |
| `UNSUPPORTED_MIME_TYPE` | 415 | Type MIME non supporté |
| `RATE_LIMIT_EXCEEDED` | 429 | Trop de requêtes |
| `OCR_SERVICE_UNAVAILABLE` | 503 | Mistral OCR indisponible |
| `INTERNAL_ERROR` | 500 | Erreur interne non attendue |

---

## 3. Endpoints par Module

---

### Module Auth

#### `POST /api/v1/auth/register`

**Description** : Crée un nouveau compte utilisateur. Crée automatiquement un premier Workspace par défaut ("Mon espace").

**Body** :
```json
{
  "email": "string — format email, requis",
  "password": "string — min 8 chars, requis",
  "displayName": "string — min 2 chars, max 100 chars, requis"
}
```

**Réponse 201** :
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "marc@example.com",
      "displayName": "Marc",
      "createdAt": "2026-03-01T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 3600
    },
    "defaultWorkspace": {
      "id": "uuid",
      "name": "Mon espace"
    }
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR` — champs manquants ou invalides
- `409 EMAIL_ALREADY_EXISTS` — email déjà enregistré

**Règles métier** :
- Le mot de passe est haché avec bcrypt (salt rounds ≥ 12) — jamais stocké en clair
- Un Workspace "Mon espace" est créé automatiquement au registre (invariant Domain : un User doit avoir au moins 1 Workspace actif)
- L'email est normalisé en lowercase avant stockage

---

#### `POST /api/v1/auth/login`

**Description** : Authentifie un utilisateur, retourne un access token et un refresh token.

**Body** :
```json
{
  "email": "string — requis",
  "password": "string — requis"
}
```

**Réponse 200** :
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "marc@example.com",
      "displayName": "Marc"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 3600
    }
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR` — champs manquants
- `401 INVALID_CREDENTIALS` — email ou mot de passe incorrect

**Règles métier** :
- La réponse est identique que l'email n'existe pas ou que le mot de passe soit incorrect (pas d'enumeration d'utilisateurs)
- Le refresh token est stocké haché côté serveur et associé au `userId`

---

#### `POST /api/v1/auth/refresh`

**Description** : Échange un refresh token valide contre une nouvelle paire access/refresh token. Le refresh token soumis est invalidé immédiatement (rotation).

**Body** :
```json
{
  "refreshToken": "string — requis"
}
```

**Réponse 200** :
```json
{
  "data": {
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 3600
    }
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR` — champ manquant
- `401 REFRESH_TOKEN_INVALID` — token expiré, révoqué ou inconnu

**Règles métier** :
- Rotation systématique : l'ancien refresh token est invalidé à chaque usage
- Si un refresh token révoqué est soumis à nouveau (détection de vol potentiel), invalider tous les refresh tokens de l'utilisateur et forcer la ré-authentification (MVP : log de l'incident)

---

### Module Workspaces

Toutes les routes requièrent un Bearer Token valide.

#### `POST /api/v1/workspaces`

**Description** : Crée un nouveau Workspace pour l'utilisateur authentifié.

**Body** :
```json
{
  "name": "string — min 1 char, max 100 chars, requis",
  "description": "string — max 500 chars, optionnel"
}
```

**Réponse 201** :
```json
{
  "data": {
    "id": "uuid",
    "name": "Pro",
    "description": null,
    "isArchived": false,
    "documentCount": 0,
    "createdAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T10:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR`
- `409 WORKSPACE_NAME_DUPLICATE` — ce User possède déjà un Workspace avec ce nom

**Règles métier** :
- Le nom est unique par User (pas globalement) — invariant du Domain Blueprint
- Le `name` est trimmed avant stockage et comparaison

---

#### `GET /api/v1/workspaces`

**Description** : Retourne la liste des Workspaces de l'utilisateur authentifié.

**Query params** :

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `includeArchived` | `boolean` | `false` | Inclure les workspaces archivés |
| `page` | `integer` | `1` | — |
| `limit` | `integer` | `30` | — |

**Réponse 200** :
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Pro",
      "description": null,
      "isArchived": false,
      "documentCount": 14,
      "createdAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 30,
    "total": 2,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  },
  "error": null
}
```

**Règles métier** :
- Retourne uniquement les Workspaces dont `ownerId` === `userId` du token
- `documentCount` exclut les documents avec `isDeleted = true`

---

#### `GET /api/v1/workspaces/:id`

**Description** : Retourne le détail d'un Workspace.

**Réponse 200** :
```json
{
  "data": {
    "id": "uuid",
    "name": "Pro",
    "description": "Mes documents professionnels",
    "isArchived": false,
    "documentCount": 14,
    "createdAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T10:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `403 FORBIDDEN` — Workspace appartient à un autre User
- `404 WORKSPACE_NOT_FOUND`

---

#### `PATCH /api/v1/workspaces/:id`

**Description** : Modifie le nom ou la description d'un Workspace. Permet aussi l'archivage.

**Body** (tous les champs sont optionnels) :
```json
{
  "name": "string — min 1, max 100",
  "description": "string — max 500, nullable",
  "isArchived": "boolean"
}
```

**Réponse 200** : ressource Workspace mise à jour (même structure que `GET /workspaces/:id`).

**Erreurs possibles** :
- `400 VALIDATION_ERROR`
- `403 FORBIDDEN`
- `404 WORKSPACE_NOT_FOUND`
- `409 WORKSPACE_NAME_DUPLICATE`
- `422 WORKSPACE_ARCHIVED` — impossible de modifier un workspace déjà archivé (sauf pour le désarchiver)

**Règles métier** :
- Un Workspace archivé ne peut être modifié qu'en passant `isArchived: false` (désarchivage) — toute autre modification est rejetée avec `422 WORKSPACE_ARCHIVED`
- Archiver un Workspace avec des documents `PROCESSING` ou `PENDING_RETRY` est autorisé — le pipeline continue mais aucun nouvel upload ne sera accepté

---

#### `DELETE /api/v1/workspaces/:id`

**Description** : Supprime définitivement un Workspace et tous ses documents.

**Réponse 204** : corps vide.

**Erreurs possibles** :
- `403 FORBIDDEN`
- `404 WORKSPACE_NOT_FOUND`
- `422 DOCUMENT_NOT_READY` — suppression bloquée si le Workspace contient des documents en cours de traitement actif (MVP : laisser le pipeline terminer ou `FAILED` avant suppression)

**Règles métier** :
- La suppression est en cascade sur les documents du Workspace (soft delete d'abord, purge différée des fichiers S3)
- Un User ne peut pas supprimer son dernier Workspace actif (invariant : 1 Workspace actif minimum)

---

### Module Documents

Toutes les routes requièrent un Bearer Token valide.

#### `POST /api/v1/documents`

**Description** : Upload d'un nouveau document. Déclenche le pipeline de traitement de manière **asynchrone** — la réponse HTTP est retournée immédiatement après confirmation du stockage fichier.

Maps vers les commandes : `InitiateDocumentUpload` → `ConfirmDocumentUploaded` → émission de `DocumentUploaded` (async).

**Content-Type** : `multipart/form-data`

**Body (form-data)** :

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `file` | `binary` | Oui | Fichier PDF, JPEG ou PNG |
| `workspaceId` | `string (uuid)` | Oui | Workspace cible |
| `title` | `string` | Non | Titre personnalisé — fallback sur `originalFilename` |

**Réponse 201** :
```json
{
  "data": {
    "id": "uuid",
    "workspaceId": "uuid",
    "title": "Facture Adobe Janvier 2025",
    "originalFilename": "facture_adobe_2025-01.pdf",
    "mimeType": "application/pdf",
    "fileSizeBytes": 245760,
    "processingStatus": "UPLOADED",
    "thumbnailUrl": null,
    "uploadedAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T10:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR` — `workspaceId` manquant ou UUID invalide
- `403 FORBIDDEN` — Workspace appartient à un autre User
- `404 WORKSPACE_NOT_FOUND`
- `413 FILE_TOO_LARGE` — fichier > 50 Mo
- `415 UNSUPPORTED_MIME_TYPE` — type MIME non parmi `application/pdf`, `image/jpeg`, `image/png`
- `422 WORKSPACE_ARCHIVED` — Workspace cible archivé

**Règles métier** :
- La réponse est retournée dès que le fichier est stocké (S3) et le document créé en BDD avec `processingStatus = UPLOADED`
- Le pipeline de traitement est déclenché **de manière non bloquante** via le Domain Event `DocumentUploaded` sur l'`InMemoryEventBus`
- Le `title` fallback sur `originalFilename` (sans extension)
- Le MIME type est validé à la fois sur l'extension et sur le magic bytes du fichier (pas uniquement sur le `Content-Type` client)
- La limite de 50 Mo est vérifiée avant stockage

---

#### `GET /api/v1/documents`

**Description** : Liste paginée des documents d'un Workspace, avec filtres combinables. Point d'entrée du polling silencieux côté client (toutes les 5 secondes pour les documents en cours de traitement).

**Query params** :

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `workspaceId` | `uuid` | Oui | Filtre obligatoire — règle de traversée du domaine |
| `query` | `string` | Non | Recherche full-text sur `extractedText` + `title` |
| `status` | `string` | Non | Filtre sur `processingStatus` — valeurs séparées par virgule |
| `detectedType` | `string` | Non | Filtre sur `detectedType` — valeurs séparées par virgule |
| `userTags` | `string` | Non | Filtre sur `userTags` — valeurs séparées par virgule (opérateur OR) |
| `dateFrom` | `string (ISO 8601)` | Non | Filtre `uploadedAt >= dateFrom` |
| `dateTo` | `string (ISO 8601)` | Non | Filtre `uploadedAt <= dateTo` |
| `sortBy` | `string` | Non | `uploadedAt` (défaut) \| `title` \| `updatedAt` |
| `sortOrder` | `string` | Non | `desc` (défaut) \| `asc` |
| `page` | `integer` | Non | `1` |
| `limit` | `integer` | Non | `30` (max `100`) |

**Réponse 200** :
```json
{
  "data": [
    {
      "id": "uuid",
      "workspaceId": "uuid",
      "title": "Facture Adobe Janvier 2025",
      "originalFilename": "facture_adobe_2025-01.pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 245760,
      "processingStatus": "ENRICHED",
      "thumbnailUrl": "https://cdn.ged.io/thumbnails/uuid.jpg",
      "intelligence": {
        "detectedType": "INVOICE",
        "suggestedTags": ["facture", "logiciel", "adobe"],
        "globalConfidenceScore": 0.94,
        "extractedEntities": [
          { "entityType": "AMOUNT", "value": "1250€", "confidence": 0.97 },
          { "entityType": "DATE", "value": "2025-01-12", "confidence": 0.99 },
          { "entityType": "VENDOR", "value": "Adobe Systems", "confidence": 0.96 }
        ]
      },
      "metadata": {
        "userTags": ["logiciel-créatif"],
        "notes": null,
        "lastEditedAt": null
      },
      "uploadedAt": "2026-03-01T10:00:00.000Z",
      "updatedAt": "2026-03-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 30,
    "total": 14,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  },
  "error": null
}
```

**Erreurs possibles** :
- `400 VALIDATION_ERROR` — `workspaceId` manquant ou invalide
- `403 FORBIDDEN` — Workspace appartient à un autre User
- `404 WORKSPACE_NOT_FOUND`

**Règles métier** :
- `workspaceId` est **obligatoire** — aucune query cross-workspace (règle de traversée Domain Blueprint)
- Les documents avec `isDeleted = true` ne sont jamais retournés
- Les documents archivés (`processingStatus = ARCHIVED`) sont exclus par défaut — inclure avec `status=ARCHIVED`
- Si `query` est présent, la recherche full-text opère sur `extractedText` + `title` (PostgreSQL `tsvector` ou FTS5)
- `intelligence` et `metadata` sont `null` si `processingStatus` est `UPLOADED`, `PROCESSING`, ou `PENDING_RETRY`

---

#### `GET /api/v1/documents/:id`

**Description** : Détail complet d'un document, incluant le texte extrait et l'historique de traitement.

**Réponse 200** :
```json
{
  "data": {
    "id": "uuid",
    "workspaceId": "uuid",
    "uploadedBy": "uuid",
    "title": "Facture Adobe Janvier 2025",
    "originalFilename": "facture_adobe_2025-01.pdf",
    "mimeType": "application/pdf",
    "fileSizeBytes": 245760,
    "pageCount": 2,
    "processingStatus": "ENRICHED",
    "textExtractionMethod": "OCR",
    "extractedText": "FACTURE\nAdobe Systems Inc.\n...",
    "thumbnailUrl": "https://cdn.ged.io/thumbnails/uuid.jpg",
    "downloadUrl": "https://cdn.ged.io/presigned/...",
    "intelligence": {
      "detectedType": "INVOICE",
      "suggestedTags": ["facture", "logiciel", "adobe"],
      "globalConfidenceScore": 0.94,
      "extractedEntities": [
        { "entityType": "AMOUNT", "value": "1250€", "confidence": 0.97 },
        { "entityType": "DATE", "value": "2025-01-12", "confidence": 0.99 },
        { "entityType": "VENDOR", "value": "Adobe Systems", "confidence": 0.96 }
      ]
    },
    "metadata": {
      "userTags": ["logiciel-créatif"],
      "notes": "À déclarer Q1 2025",
      "userOverrideType": null,
      "lastEditedAt": "2026-03-01T11:30:00.000Z"
    },
    "processingEvents": [
      {
        "eventId": "uuid",
        "eventType": "OCR_STARTED",
        "occurredAt": "2026-03-01T10:00:05.000Z",
        "isSuccess": true,
        "errorMessage": null
      },
      {
        "eventId": "uuid",
        "eventType": "CLASSIFICATION_DONE",
        "occurredAt": "2026-03-01T10:00:12.000Z",
        "isSuccess": true,
        "errorMessage": null
      }
    ],
    "uploadedAt": "2026-03-01T10:00:00.000Z",
    "updatedAt": "2026-03-01T11:30:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `403 FORBIDDEN` — Document appartient à un autre User
- `404 DOCUMENT_NOT_FOUND`

**Règles métier** :
- `downloadUrl` est une presigned URL S3 GET valable 15 minutes, générée à chaque appel — jamais une URL permanente
- `extractedText` peut être `null` si `processingStatus` est `UPLOADED`, `PROCESSING`, `FAILED`, ou `PENDING_RETRY`
- `processingEvents` sont retournés dans l'ordre chronologique ascendant (`occurredAt ASC`)
- `userOverrideType` : si l'utilisateur a corrigé le `detectedType`, l'override est stocké ici — `null` si aucune correction

---

#### `PATCH /api/v1/documents/:id`

**Description** : Modifie les métadonnées éditables du document (`DocumentMetadata`). Maps vers la commande `UpdateDocumentMetadata`.

**Body** (tous les champs optionnels) :
```json
{
  "title": "string — min 1, max 255",
  "userTags": ["string"],
  "notes": "string — max 2000, nullable",
  "userOverrideType": "INVOICE | CONTRACT | RECEIPT | ID_DOCUMENT | BANK_STATEMENT | OTHER | null"
}
```

**Réponse 200** : document complet mis à jour (même structure que `GET /documents/:id`).

**Erreurs possibles** :
- `400 VALIDATION_ERROR`
- `403 FORBIDDEN`
- `404 DOCUMENT_NOT_FOUND`
- `422 DOCUMENT_NOT_READY` — modification impossible si `processingStatus` est `UPLOADED` ou `PROCESSING`

**Règles métier** :
- Seuls les champs de `DocumentMetadata` sont modifiables — `processingStatus`, `extractedText`, `intelligence` sont immuables via cet endpoint
- `userTags` : la liste soumise **remplace** la liste existante (pas de merge implicite) — envoyer la liste complète
- `userOverrideType` : surcharge le `detectedType` à l'affichage, sans écraser la valeur originale dans `DocumentIntelligence` (préservation de la donnée IA — règle absolue du Domain Blueprint)
- `notes` accepte `null` pour effacer le champ
- `lastEditedAt` est mis à jour automatiquement côté serveur

---

#### `DELETE /api/v1/documents/:id`

**Description** : Supprime un document (soft delete immédiat, purge S3 différée).

**Réponse 204** : corps vide.

**Erreurs possibles** :
- `403 FORBIDDEN`
- `404 DOCUMENT_NOT_FOUND`

**Règles métier** :
- Soft delete : `isDeleted = true`, le document disparaît de toutes les listes et recherches
- La purge du fichier S3 (fichier brut + thumbnail) est effectuée de manière asynchrone par un job (MVP : job cron quotidien)
- Un document en cours de traitement (`PROCESSING`) peut être supprimé — le pipeline en cours sera interrompu à sa prochaine vérification de l'état du document

---

#### `POST /api/v1/documents/:id/reprocess`

**Description** : Relance le pipeline de traitement sur un document en état `FAILED`. Maps vers la commande `RetryDocumentProcessing`.

**Body** : vide (`{}`)

**Réponse 200** :
```json
{
  "data": {
    "id": "uuid",
    "processingStatus": "PENDING_RETRY",
    "updatedAt": "2026-03-01T12:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `403 FORBIDDEN`
- `404 DOCUMENT_NOT_FOUND`
- `422 INVALID_STATUS_TRANSITION` — le document n'est pas en état `FAILED`

**Règles métier** :
- Seuls les documents en état `FAILED` peuvent être reprocessés — transition : `FAILED → PENDING_RETRY → PROCESSING`
- La transition vers `PROCESSING` est déclenchée de manière asynchrone (non bloquante)
- Le pipeline est relancé intégralement depuis le début (pas de reprise partielle en MVP)

---

#### `POST /api/v1/documents/:id/archive`

**Description** : Archive un document (le retire de la circulation active). Maps vers la commande `ArchiveDocument`.

**Body** : vide (`{}`)

**Réponse 200** :
```json
{
  "data": {
    "id": "uuid",
    "processingStatus": "ARCHIVED",
    "updatedAt": "2026-03-01T12:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

**Erreurs possibles** :
- `403 FORBIDDEN`
- `404 DOCUMENT_NOT_FOUND`
- `422 INVALID_STATUS_TRANSITION` — le document doit être en état `ENRICHED` ou `CLASSIFIED_ONLY` pour être archivé

**Règles métier** :
- Seuls les documents en état `ENRICHED` ou `CLASSIFIED_ONLY` peuvent être archivés
- Un document archivé n'apparaît plus dans `GET /documents` sans `status=ARCHIVED`
- L'archivage est réversible via `PATCH /documents/:id` avec une commande dédiée (V2) — en MVP, un document archivé peut être désarchivé via cet endpoint avec une logique symétrique

---

### Module Me (User)

#### `GET /api/v1/me`

**Description** : Retourne le profil de l'utilisateur authentifié.

**Réponse 200** :
```json
{
  "data": {
    "id": "uuid",
    "email": "marc@example.com",
    "displayName": "Marc",
    "tier": "free",
    "createdAt": "2026-03-01T10:00:00.000Z"
  },
  "meta": {},
  "error": null
}
```

---

#### `PATCH /api/v1/me`

**Description** : Met à jour le profil utilisateur.

**Body** :
```json
{
  "displayName": "string — min 2, max 100, optionnel"
}
```

**Réponse 200** : profil mis à jour.

**Erreurs possibles** :
- `400 VALIDATION_ERROR`

---

## 4. États du Document

### Référentiel des statuts

| Statut | Signification technique | Label UX |
|--------|------------------------|----------|
| `PENDING_UPLOAD` | Initié côté client, fichier pas encore reçu | — (interne) |
| `UPLOADED` | Fichier stocké, pipeline pas encore démarré | "Document reçu" |
| `PROCESSING` | Pipeline en cours d'exécution | "Analyse en cours…" |
| `PARTIALLY_ENRICHED` | Texte extrait, classification en cours | "Analyse en cours…" |
| `CLASSIFIED_ONLY` | PDF natif — texte + classification OK, OCR skippé | "Prêt" |
| `ENRICHED` | Texte + classification + entités + thumbnail disponibles — état stable final | "Prêt" |
| `FAILED` | Erreur non récupérable dans le pipeline | "Analyse incomplète" |
| `PENDING_RETRY` | Retry déclenché, en attente de re-traitement | "Nouvelle analyse en cours…" |
| `ARCHIVED` | Document hors circulation active | "Archivé" |

### Graphe de transitions

```
PENDING_UPLOAD
    │
    ▼
UPLOADED ──────────────────────────────────────────┐
    │                                               │
    ▼                                               │ (PDF natif searchable)
PROCESSING                                          │
    │                                               ▼
    ├──► PARTIALLY_ENRICHED                   CLASSIFIED_ONLY
    │           │                                   │
    ▼           ▼                                   │
  ENRICHED ◄────┘ ◄─────────────────────────────────┘
    │
    ▼
ARCHIVED

PROCESSING / PARTIALLY_ENRICHED ──► FAILED
                                        │
                                        ▼
                                  PENDING_RETRY ──► PROCESSING
```

### Règles de transition

| De | Vers | Déclencheur | Responsable |
|----|------|-------------|-------------|
| `PENDING_UPLOAD` | `UPLOADED` | Stockage S3 confirmé | `ConfirmDocumentUploaded` command |
| `UPLOADED` | `PROCESSING` | `DocumentUploaded` event consommé par `ProcessingModule` | Pipeline async |
| `UPLOADED` | `CLASSIFIED_ONLY` | PDF natif détecté, bypass OCR | `PipelineStepRouter` |
| `PROCESSING` | `PARTIALLY_ENRICHED` | Texte extrait, classification indisponible | Pipeline async |
| `PROCESSING` | `ENRICHED` | Texte + classification + entités + thumbnail OK | Pipeline async |
| `PARTIALLY_ENRICHED` | `ENRICHED` | Classification complétée en différé | Pipeline async |
| `PROCESSING` / `PARTIALLY_ENRICHED` | `FAILED` | Erreur non récupérable dans le pipeline | Pipeline async |
| `FAILED` | `PENDING_RETRY` | Action utilisateur via `POST /documents/:id/reprocess` | `RetryDocumentProcessing` command |
| `PENDING_RETRY` | `PROCESSING` | Re-déclenchement du pipeline | Pipeline async |
| `ENRICHED` / `CLASSIFIED_ONLY` | `ARCHIVED` | Action utilisateur via `POST /documents/:id/archive` | `ArchiveDocument` command |

**Invariant absolu** : `processingStatus` ne peut jamais régresser, sauf la transition `FAILED → PENDING_RETRY`. Toute tentative de transition invalide est rejetée avec `422 INVALID_STATUS_TRANSITION`.

---

## 5. Recherche Plein Texte

### Endpoint
GET /api/v1/documents?workspaceId=&query=&detectedType=&userTags=&status=&dateFrom=&dateTo=&sortBy=&sortOrder=&page=&limit=

### Paramètres détaillés

| Param | Type | Exemple | Comportement |
|-------|------|---------|--------------|
| `workspaceId` | `uuid` | `abc-123` | **Obligatoire.** Scope la recherche à un Workspace |
| `query` | `string` | `adobe facture` | Full-text sur `extractedText` + `title`. Opérateur : tous les mots (AND). Min 2 chars pour déclencher FTS |
| `detectedType` | `string` | `INVOICE,CONTRACT` | Filtre multi-valeur (OR). Valeurs séparées par virgule |
| `userTags` | `string` | `logiciel,abonnement` | Filtre multi-valeur (OR) sur `userTags`. Sensible à la casse |
| `status` | `string` | `ENRICHED,FAILED` | Filtre multi-valeur (OR) sur `processingStatus` |
| `dateFrom` | `ISO 8601` | `2025-01-01` | `uploadedAt >= dateFrom` |
| `dateTo` | `ISO 8601` | `2025-12-31` | `uploadedAt <= dateTo` |
| `sortBy` | `enum` | `uploadedAt` | `uploadedAt` \| `title` \| `updatedAt` |
| `sortOrder` | `enum` | `desc` | `asc` \| `desc` |
| `page` | `integer` | `1` | Base 1 |
| `limit` | `integer` | `30` | Max `100` |

### Comportements combinés

- Plusieurs paramètres sont combinés en **AND** entre eux : `query` + `detectedType` + `userTags` = résultats satisfaisant toutes les conditions
- Au sein d'un même paramètre multi-valeur (ex : `detectedType=INVOICE,CONTRACT`), l'opérateur est **OR**
- Si `query` est absent, la liste est retournée avec les filtres structurels uniquement
- Si aucun filtre n'est fourni (sauf `workspaceId`), retourne tous les documents actifs du Workspace

### Tri par défaut

Sans `sortBy` explicite : tri par pertinence si `query` est présent (score FTS), sinon `uploadedAt DESC`.

### Réponse

Identique à `GET /documents` — voir section 3 pour la structure complète.

---

## 6. Considérations Techniques Fastify

### Validation — JSON Schema

Fastify valide nativement les requêtes via JSON Schema défini sur chaque route. Les schémas sont organisés dans `/interfaces/http/[module]/schemas/`.

- **Body** : chaque endpoint `POST` / `PATCH` dispose d'un schéma `body` avec `required`, `type`, `minLength`, `maxLength`, `format: "uuid"`, `enum`
- **Query params** : les params de filtrage sont validés (`type: "string"`, `enum` pour les valeurs connues)
- **Params** : les `:id` sont validés avec `format: "uuid"` pour rejeter les identifiants malformés avant d'atteindre le handler
- La validation Fastify retourne automatiquement une réponse `400` — le handler doit intercepter et reformater selon la structure `error` standard (via `setErrorHandler`)

### Séparation routes / handlers / services

```
/interfaces/http/documents/
  ├── document.routes.ts      ← Enregistrement des routes, schémas JSON
  ├── document.handler.ts     ← Extraction params, appel service, formatage réponse
  └── document.schemas.ts     ← JSON Schemas (body, querystring, response)

/modules/document/application/
  ├── commands/               ← Use cases de mutation
  └── queries/                ← Use cases de lecture
```

Le handler ne contient **aucune logique métier** — il orchestre uniquement : extraction des inputs, appel du use case, formatage de la réponse standard. La logique métier vit dans les commandes/queries du module.

### Hooks pour l'authentification

L'authentification JWT est implémentée via un hook `preHandler` global enregistré sur le préfixe `/api/v1` :

onRequest hook → vérification présence du header Authorization
preHandler hook → validation signature JWT + injection userId dans request.user

Les routes publiques (`/auth/*`) sont exemptées via `config: { auth: false }` sur la déclaration de route.

L'`userId` extrait du JWT est **systématiquement** utilisé pour les vérifications d'appartenance des ressources — jamais un `userId` passé dans le body ou les query params.

### Gestion des erreurs centralisée

Un `setErrorHandler` global sur l'instance Fastify intercepte toutes les erreurs non gérées et les formate selon la structure standard. Il distingue :

- **Erreurs de validation Fastify** (400) → reformatage en `VALIDATION_ERROR` avec `details[]`
- **Erreurs métier** (classes dédiées `DomainError`, `NotFoundError`, `ForbiddenError`) → mapping vers les codes HTTP et codes métier définis en section 2
- **Erreurs inconnues** → log interne, retour générique `500 INTERNAL_ERROR` sans détails d'implémentation exposés au client

Les erreurs opérationnelles (service OCR indisponible, S3 timeout) génèrent un `503 OCR_SERVICE_UNAVAILABLE` avec message utilisateur — le détail technique est loggé côté serveur uniquement.

---

## 7. Non-Goals MVP

Les éléments suivants sont **explicitement exclus** du périmètre de cet API Contract.

| Fonctionnalité | Raison d'exclusion | Cible |
|----------------|-------------------|-------|
| **Partage public de documents** | Complexité token + surface d'attaque — reporté | V2 |
| **Collaboration multi-utilisateurs sur un Workspace** | Modèle d'autorisation simple (1 owner) pour MVP | V3 |
| **Versioning des métadonnées intelligentes** | L'historique des analyses = sur-ingénierie MVP | V2 |
| **Audit logs avancés** | Les `ProcessingEvent` couvrent le besoin MVP | V2 |
| **Analytics avancées** (volumes, tendances) | Aucun besoin produit MVP identifié | V3 |
| **Webhooks / notifications push** | Polling client suffisant pour MVP | V2 |
| **Déplacement de document entre Workspaces** | Commande métier explicite — domaine défini, reporté | V2 |
| **Export de données** (CSV, rapport) | — | V3 |
| **Politiques de retry configurables** | Retry manuel suffisant pour MVP | V2 |
| **Endpoint de sync mobile** (`GET /sync`, `POST /documents/sync`) | Inclus dans le TDD pour le client mobile Capacitor — hors scope de cet API Contract REST standard | Spécification séparée |

---

*API Contract v1.0 — aligné sur Domain Blueprint v1.0 · Module Blueprint v1.1 · TDD v1.0*