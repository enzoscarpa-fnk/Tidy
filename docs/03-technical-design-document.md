Voici le TDD complet. Document long par nature — aucune section n'a été compressée, chaque choix est justifié et chaque flux est décrit sans ambiguïté.

***

# Technical Design Document — Application GED Mobile
**Version** : 1.0
**Statut** : Blueprint MVP — usage BMAD
**Dernière mise à jour** : Février 2026

***

## 1. Architecture Générale

### 1.1 Vue d'ensemble logique

Le système est composé de trois périmètres distincts avec des responsabilités non chevauchantes :

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT MOBILE                     │
│  Nuxt + Capacitor (iOS 16+ / Android 11+)           │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ UI Layer │  │ App Layer│  │ Infrastructure     │ │
│  │ (Vue SFC)│  │(Services)│  │ (SQLite / FS /     │ │
│  │          │  │          │  │  Plugins natifs)   │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS / TLS 1.3
┌───────────────────────▼─────────────────────────────┐
│                    BACKEND API                       │
│  Fastify + Node.js (VPS ou conteneur)               │
│  ┌──────────────┐  ┌───────────────┐                │
│  │  Auth / JWT  │  │  Sync Engine  │                │
│  │  Share Links │  │  OCR Proxy    │                │
│  └──────────────┘  └───────────────┘                │
└────────────┬─────────────────────────────┬───────────┘
             │                             │
┌────────────▼────────┐       ┌────────────▼──────────┐
│     PostgreSQL       │       │       AWS S3           │
│  (metadata, sync,   │       │  (fichiers chiffrés,  │
│   partage, users)   │       │   CDN CloudFront)      │
└─────────────────────┘       └───────────────────────┘
                                             │
                              ┌──────────────▼──────────┐
                              │     Mistral OCR API      │
                              │  (appelé depuis backend) │
                              └─────────────────────────┘
```

### 1.2 Découpage en couches — Mobile

| Couche | Responsabilité | Technologie |
|---|---|---|
| **UI** | Rendu des écrans, interactions utilisateur | Vue 3 SFC, Nuxt pages |
| **Application** | Orchestration des use cases (CaptureService, SearchService, SyncService, ShareService) | TypeScript services |
| **Domain** | Entités, règles métier (Document, ShareLink, SyncState) | TypeScript classes pures |
| **Infrastructure** | Accès SQLite, filesystem natif, réseau, chiffrement | Plugins Capacitor natifs |

### 1.3 Justification monolithe backend vs microservices

**Choix : monolithe Fastify modulaire.**

Justification : à 500–10 000 utilisateurs, la complexité opérationnelle des microservices (service discovery, messaging, distributed tracing) est un surcoût sans bénéfice réel. Un monolithe modulaire avec des modules Fastify clairement délimités (auth, documents, sync, share) permet une extraction future sans réécriture. Le seul service externe est Mistral OCR — qui l'est par nature, pas par choix architectural.

### 1.4 Challenge sur NestJS → Fastify

**NestJS non retenu pour MVP car disproportionné. Reconsidérable à >10k users ou équipe >4 devs.** Justification :

| Critère | NestJS | Fastify |
|---|---|---|
| Cold start | 500–2000 ms | < 100 ms |
| Overhead mémoire | ~120 Mo baseline | ~30 Mo baseline |
| Courbe d'entrée | Élevée (decorators, DI container) | Faible |
| Adapté à une petite équipe | Non — over-engineering pour MVP | Oui |
| Performance JSON | Standard | Schéma JSON natif, 2x plus rapide |

NestJS est adapté à des équipes > 5 ingénieurs sur des domaines complexes. Pour une équipe 2–3 personnes sur un MVP où la vitesse d'exécution prime, Fastify est objectivement supérieur.[1][2]

***

## 2. Architecture Mobile

### 2.1 Nuxt + Capacitor — Validation et contraintes

**Nuxt + Capacitor est retenu avec conditions.**[3]

Conditions non négociables :
- Le chiffrement ne doit **jamais** s'exécuter dans la WebView JavaScript — uniquement via plugin natif
- Le filesystem (lecture/écriture fichiers) doit passer par `@capacitor/filesystem`, pas par `window.localStorage` ni IndexedDB
- SQLite doit passer par `@capawesome/capacitor-sqlite` avec chiffrement activé[4]

### 2.2 Plugins natifs requis

| Plugin | Usage | Justification |
|---|---|---|
| `@capawesome/capacitor-sqlite` | Base SQLite chiffrée AES-256 | Supporte FTS5, encryption native, migrations [5][4] |
| `@capacitor-community/secure-storage` | Stockage de la clé de chiffrement | iOS Keychain / Android Keystore [6] |
| `@capacitor/filesystem` | Lecture/écriture fichiers sur device | Accès natif au sandbox app |
| `@capacitor/camera` | Scan via caméra | Accès caméra natif |
| `@capacitor/network` | Détection réseau | Trigger sync au retour de connexion |
| `@capacitor/share` | Share sheet native iOS/Android | Partage lien sortant |
| `@capacitor/app` | Lifecycle (background/foreground) | Gestion reprise sync |

**Plugin non retenu** : `@ionic-enterprise/identity-vault` — hardware-level encryption utile mais coût de licence élevé, non justifié au MVP.[6]

### 2.3 Caméra et détection de bords

La détection automatique des bords du document ne peut pas être implémentée nativement via un plugin Capacitor standard. Deux options :

**Option A (retenue MVP)** : Bibliothèque JavaScript `opencv.js` ou `dynamsoft-document-normalizer` en WebView. Latence acceptable (~200 ms sur mid-range). Pas de plugin natif requis.

**Option B (V2)** : Plugin natif utilisant `Vision Framework` (iOS) et `ML Kit Document Scanner` (Android). Meilleures performances, développement plus long.

Pour le MVP, Option A est suffisante. La détection de bords est un confort UX, pas un composant critique de la valeur produit.

### 2.4 Share sheet iOS / Android

**iOS** : implémenter un `Share Extension` via Xcode. Le fichier entrant est reçu dans le group container partagé (`app group`), lu par l'app principale au prochain lancement ou en foreground.

**Android** : déclarer dans `AndroidManifest.xml` un `intent-filter` avec `action.SEND` et types MIME `application/pdf`, `image/jpeg`, `image/png`. L'intent est reçu dans l'activité principale.

```xml
<!-- Android intent-filter -->
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="application/pdf" />
  <data android:mimeType="image/jpeg" />
  <data android:mimeType="image/png" />
</intent-filter>
```

Le fichier reçu est copié dans le sandbox app avant traitement. L'original (dans le répertoire temporaire système) est supprimé après copie.

### 2.5 Gestion lifecycle

| Événement | Action |
|---|---|
| App en foreground | Vérifier réseau → déclencher sync si queue non vide |
| App en background | Suspendre les appels OCR en cours — marquer `ocr_status = 'pending'` |
| App kill + redémarrage | Au démarrage, scanner la table `documents` pour les `ocr_status = 'pending'` et `sync_status = 'pending'` → reprendre |
| Réseau disponible (`@capacitor/network` event) | Déclencher sync incrémentale immédiatement |
| Réseau perdu en cours de sync | Rollback de la transaction en cours → statut `sync_status = 'error'` → retry au prochain événement réseau |

### 2.6 Stratégie performance device ≤ 3 Go RAM

- **Taille max fichier** : 50 Mo (rejetée à l'import avec message explicite)
- **Traitement OCR** : asynchrone, non bloquant — file d'attente locale, pas de traitement en parallèle
- **Chiffrement** : natif (hors WebView) — ne bloque pas le thread UI
- **SQLite** : requêtes FTS5 exécutées sur thread séparé via le plugin (asynchrone)
- **Images preview** : thumbnails générés et stockés à la capture (max 200x200 px JPEG), jamais le fichier full-size chargé pour la liste
- **Pagination** : la liste des documents est paginée par 30 éléments, chargement au scroll

***

## 3. Modèle de Données Local

### 3.1 Schéma SQLite — DDL complet

```sql
-- =============================================
-- TABLE : documents
-- Entité centrale. Un enregistrement par document.
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  id                TEXT PRIMARY KEY,          -- UUID v4, généré côté client
  local_file_path   TEXT NOT NULL,             -- Chemin relatif dans le sandbox app
  thumbnail_path    TEXT,                      -- Chemin thumbnail 200x200 (nullable avant génération)
  original_filename TEXT NOT NULL,             -- Nom original du fichier importé ou "scan_YYYYMMDD_HHmmss"
  mime_type         TEXT NOT NULL,             -- 'application/pdf' | 'image/jpeg' | 'image/png'
  file_size_bytes   INTEGER NOT NULL,          -- Taille fichier en octets
  tag               TEXT NOT NULL DEFAULT 'Autre', -- Voir contrainte ci-dessous
  ocr_text          TEXT,                      -- Texte brut extrait par OCR (nullable avant traitement)
  ocr_status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processing' | 'done' | 'error'
  ocr_error_message TEXT,                      -- Message d'erreur OCR si status = 'error'
  ocr_confidence    REAL,                      -- Score de confiance retourné par Mistral (0.0–1.0)
  sync_status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'synced' | 'error'
  sync_error_message TEXT,
  cloud_key         TEXT,                      -- Clé S3 du fichier après upload (nullable avant sync)
  is_deleted        INTEGER NOT NULL DEFAULT 0, -- Soft delete : 0 = actif, 1 = supprimé
  created_at        INTEGER NOT NULL,          -- Unix timestamp ms (horloge locale au moment de la capture)
  updated_at        INTEGER NOT NULL,          -- Unix timestamp ms — mis à jour à chaque modification locale
  synced_at         INTEGER,                   -- Unix timestamp ms de la dernière sync cloud réussie
  CONSTRAINT chk_tag CHECK (tag IN (
    'Contrat', 'Facture', 'Identité', 'Administratif',
    'Bancaire', 'Fiscal', 'Reçu', 'Autre'
  )),
  CONSTRAINT chk_ocr_status CHECK (ocr_status IN ('pending', 'processing', 'done', 'error')),
  CONSTRAINT chk_sync_status CHECK (sync_status IN ('pending', 'synced', 'error')),
  CONSTRAINT chk_mime CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png'))
);

-- =============================================
-- TABLE : share_links
-- Liens de partage actifs générés localement.
-- La source de vérité est le serveur — cette table
-- est un cache local pour l'affichage UI.
-- =============================================
CREATE TABLE IF NOT EXISTS share_links (
  id             TEXT PRIMARY KEY,   -- UUID v4
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE, -- Token opaque 32+ chars (reçu du serveur)
  expires_at     INTEGER NOT NULL,   -- Unix timestamp ms
  is_revoked     INTEGER NOT NULL DEFAULT 0, -- 0 = actif, 1 = révoqué
  created_at     INTEGER NOT NULL,
  CONSTRAINT chk_revoked CHECK (is_revoked IN (0, 1))
);

-- =============================================
-- TABLE : sync_log
-- Journal des opérations de sync pour reprise.
-- =============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   TEXT NOT NULL,
  operation     TEXT NOT NULL,        -- 'upload' | 'update_meta' | 'delete'
  status        TEXT NOT NULL,        -- 'pending' | 'in_progress' | 'done' | 'error'
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt  INTEGER,              -- Unix timestamp ms
  error_message TEXT,
  created_at    INTEGER NOT NULL,
  CONSTRAINT chk_operation CHECK (operation IN ('upload', 'update_meta', 'delete')),
  CONSTRAINT chk_status CHECK (status IN ('pending', 'in_progress', 'done', 'error'))
);

-- =============================================
-- TABLE : app_state
-- État global de l'application (clé/valeur).
-- =============================================
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Valeurs initiales insérées au setup :
-- 'last_sync_at'        → '0'   (timestamp ms)
-- 'document_count'      → '0'
-- 'user_tier'           → 'free'
-- 'user_id'             → UUID généré à l'installation

-- =============================================
-- FTS5 : index full-text sur contenu OCR + nom
-- =============================================
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  id UNINDEXED,          -- Non indexé, utilisé comme rowid reference
  original_filename,
  ocr_text,
  tag UNINDEXED,
  content='documents',   -- Table source pour rebuild
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 1'
  -- unicode61 : gestion accents et casse (NFR — insensible accents/casse)
);

-- Triggers pour maintenir la cohérence FTS5
CREATE TRIGGER IF NOT EXISTS documents_fts_insert
AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, id, original_filename, ocr_text, tag)
  VALUES (new.rowid, new.id, new.original_filename, new.ocr_text, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS documents_fts_update
AFTER UPDATE ON documents BEGIN
  DELETE FROM documents_fts WHERE rowid = old.rowid;
  INSERT INTO documents_fts(rowid, id, original_filename, ocr_text, tag)
  VALUES (new.rowid, new.id, new.original_filename, new.ocr_text, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS documents_fts_delete
AFTER DELETE ON documents BEGIN
  DELETE FROM documents_fts WHERE rowid = old.rowid;
END;

-- =============================================
-- INDEX complémentaires
-- =============================================
CREATE INDEX IF NOT EXISTS idx_documents_tag ON documents(tag) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_documents_sync_status ON documents(sync_status) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON documents(ocr_status);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status, document_id);
CREATE INDEX IF NOT EXISTS idx_share_links_document ON share_links(document_id);
```

### 3.2 Stratégie de migration

Chaque version de l'app embarque un numéro de version de schéma stocké dans `app_state` (clé `schema_version`). Au démarrage, si `schema_version` < version courante, les migrations sont appliquées séquentiellement.

```typescript
// Migration runner simplifié
const MIGRATIONS: Record<number, string[]> = {
  1: [/* DDL initial */],
  2: ['ALTER TABLE documents ADD COLUMN ocr_confidence REAL;'],
  // ...
};

async function runMigrations(db: SQLiteConnection, currentVersion: number, targetVersion: number) {
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    for (const sql of MIGRATIONS[v]) {
      await db.execute(sql);
    }
  }
  await db.execute(`UPDATE app_state SET value = '${targetVersion}' WHERE key = 'schema_version'`);
}
```

***

## 4. Stockage Fichiers

### 4.1 Localisation

Les fichiers sont stockés dans le sandbox privé de l'application, inaccessible aux autres apps sans root/jailbreak :

- **iOS** : `<AppDataDirectory>/Library/Application Support/ged/files/`
- **Android** : `<InternalDataDirectory>/files/ged/files/`

Accès via `@capacitor/filesystem` avec `Directory.Library` (iOS) et `Directory.Data` (Android). Ces répertoires survivent aux mises à jour de l'app et ne sont pas purgés par le système.

### 4.2 Convention de nommage

```
{uuid_document}.{extension_originale}
Exemples :
  a3f7b2c1-9e4d-4a8b-b3f1-2c8d7e6f5a4b.pdf
  7d2e1a9c-3b5f-4c2d-a1e8-9f7b6c5d4e3a.jpg
```

Le nom d'origine est conservé dans `documents.original_filename` mais n'est jamais utilisé pour le chemin physique. Évite les collisions et les caractères spéciaux.

**Thumbnails** : `{uuid_document}_thumb.jpg` dans `<AppDataDirectory>/ged/thumbs/`

### 4.3 Gestion taille 50 Mo

Validation à l'import avant toute écriture disque :

```typescript
async function validateFileSize(uri: string): Promise<void> {
  const stat = await Filesystem.stat({ path: uri });
  if (stat.size > 50 * 1024 * 1024) {
    throw new AppError('FILE_TOO_LARGE', `Fichier trop volumineux : ${(stat.size / 1024 / 1024).toFixed(1)} Mo. Maximum : 50 Mo.`);
  }
}
```

Le message d'erreur est présenté immédiatement à l'utilisateur. Aucun enregistrement partiel en base.

### 4.4 Stratégie nettoyage

**Soft delete** : `is_deleted = 1` dans SQLite + `sync_log` entry `operation = 'delete'`. Le fichier physique local est supprimé immédiatement. L'objet S3 est supprimé uniquement après confirmation de la sync de suppression par le serveur. Prévient la perte de fichier si la suppression cloud échoue.

**Orphelins** : au démarrage, scan comparant les fichiers dans `ged/files/` aux chemins en base. Tout fichier sans entrée correspondante est supprimé.

### 4.5 Stratégie corruption fichier

À l'ouverture d'un document :

```typescript
async function openDocument(doc: Document): Promise<Blob> {
  try {
    const file = await Filesystem.readFile({ path: doc.local_file_path, directory: Directory.Library });
    return file.data;
  } catch (e) {
    // Fichier local absent ou corrompu
    if (doc.sync_status === 'synced' && doc.cloud_key) {
      // Tentative de récupération cloud
      const blob = await downloadFromCloud(doc.cloud_key);
      await Filesystem.writeFile({ path: doc.local_file_path,  blob, directory: Directory.Library });
      return blob;
    }
    // Fichier non synchronisé et corrompu : irrécupérable
    throw new AppError('FILE_CORRUPTED', 'Le fichier est introuvable et non sauvegardé.');
  }
}
```

***

## 5. Chiffrement

### 5.1 Architecture de gestion des clés

**Principe** : une clé symétrique AES-256 par utilisateur, dérivée à l'installation, jamais transmise au serveur.

```
INSTALLATION
     │
     ▼
Génération d'une clé AES-256 aléatoire (crypto.getRandomValues)
     │
     ▼
Stockage de la clé dans Secure Storage natif
(iOS Keychain / Android Keystore via @capacitor-community/secure-storage)
     │
     ▼
La clé est référencée par l'alias : 'ged_doc_encryption_key'
     │
     ▼
La base SQLite est ouverte avec cette clé (passphrase Capawesome SQLite)
Les fichiers sont chiffrés individuellement avant écriture filesystem
```

### 5.2 Flux chiffrement à l'écriture

```
1. Fichier reçu (scan/import) → ArrayBuffer en mémoire
2. Lecture de la clé depuis Secure Storage
3. Chiffrement AES-256-GCM :
   - IV (nonce) : 12 bytes aléatoires générés par opération
   - Output : IV (12 bytes) || AuthTag (16 bytes) || Ciphertext
4. Écriture du buffer chiffré sur le filesystem natif
5. Entrée SQLite créée avec le chemin du fichier chiffré
```

**AES-GCM est retenu sur AES-CBC** car il fournit à la fois confidentialité et intégrité (AEAD). La corruption ou la falsification du ciphertext sera détectée à la déchiffrement.

### 5.3 Flux déchiffrement à la lecture

```
1. Lecture du buffer chiffré depuis filesystem
2. Extraction des 12 premiers bytes → IV
3. Extraction bytes 12–28 → AuthTag
4. Extraction bytes 28→fin → Ciphertext
5. Lecture clé depuis Secure Storage
6. Déchiffrement AES-256-GCM
7. Si AuthTag invalide → AppError('DECRYPTION_FAILED') → flow corruption
```

### 5.4 Stockage des clés

| Plateforme | Mécanisme | Garantie |
|---|---|---|
| iOS | Keychain, accessibility `kSecAttrAccessibleAfterFirstUnlock` | Clé inaccessible avant premier déverrouillage après reboot |
| Android | Android Keystore (TEE ou SE si disponible) | Clé liée au device, inaccessible sans déverrouillage |

La base SQLite elle-même est chiffrée avec cette même clé via `@capawesome/capacitor-sqlite` (passphrase mode). Cela signifie que la clé protège à la fois les fichiers et les métadonnées/index.[5]

### 5.5 Rotation de clé

**Non implémentée en MVP.** Accepté comme dette technique (voir section 12). La rotation nécessiterait de re-chiffrer tous les fichiers locaux et de migrer la base SQLite — opération longue sur des milliers de documents. Hors scope MVP.

### 5.6 Impact performance

Benchmark cible sur Android mid-range (3 Go RAM, Snapdragon 680) :
- Chiffrement 10 Mo via plugin natif : < 800 ms
- Déchiffrement 10 Mo via plugin natif : < 800 ms
- Ouverture base SQLite chiffrée (cold) : < 300 ms

Ces valeurs sont à valider lors du spike technique. Si le déchiffrement dépasse 1 seconde sur des PDF volumineux, le flow prévu est : affichage du thumbnail en < 100 ms (non chiffré) + déchiffrement en fond + affichage document complet dès disponible.

### 5.7 Device compromis

En cas de root (Android) ou jailbreak (iOS), le Keystore/Keychain peut être extrait. Risque accepté en MVP — les données restent chiffrées au repos sur un device non compromis. La mitigation complète (biométrie obligatoire, integrity check) est en V2.

***

## 6. OCR Flow

### 6.1 Flux complet : Capture → Stockage

```
ÉTAPE 1 — Capture ou import
  ├── Scan caméra → image JPEG (quality 85)
  └── Import PDF/JPG/PNG depuis share sheet

ÉTAPE 2 — Pré-traitement local
  ├── Validation taille (< 50 Mo)
  ├── Génération UUID document
  ├── Génération thumbnail (200x200 px)
  ├── Chiffrement fichier source → écriture filesystem
  └── INSERT documents (ocr_status='pending', sync_status='pending')

ÉTAPE 3 — Envoi à Mistral OCR (via backend proxy)
  ├── POST /api/ocr/process
  ├── Payload : { document_id, file_base64, mime_type }
  └── Le backend relaie à Mistral OCR API

ÉTAPE 4 — Réception résultat
  ├── Succès → { text, confidence, pages }
  ├── UPDATE documents SET ocr_text=?, ocr_confidence=?, ocr_status='done'
  ├── UPDATE documents_fts (via trigger)
  └── Marquer sync_log entry → sync_status='pending'

ÉTAPE 5 — En cas d'erreur ou offline
  ├── ocr_status reste 'pending'
  ├── Retry au prochain foreground ou retour réseau
  └── Après 3 échecs → ocr_status='error', ocr_error_message=<raison>
```

### 6.2 Pourquoi passer par un backend proxy pour l'OCR

L'appel Mistral OCR ne se fait **pas directement depuis le mobile**. Raisons :
1. La clé API Mistral ne doit jamais être embarquée dans l'app mobile (extractible)
2. Le backend peut mettre en place du rate limiting par utilisateur
3. Le backend peut valider le tier Free avant d'autoriser l'appel (quota 30 docs)
4. Audit log centralisé des appels OCR

### 6.3 Timeout et retry

| Paramètre | Valeur | Justification |
|---|---|---|
| Timeout appel OCR | 15 secondes | NFR2 : OCR < 5s en cible ; 15s = marge pour réseau lent |
| Retry max | 3 tentatives | Au-delà, marquer error et informer l'utilisateur |
| Backoff | Exponentiel : 2s, 8s, 32s | Éviter la surcharge en cas de dégradation API |
| Retry sur | Erreurs 429, 500, 502, 503, timeout | Pas de retry sur 400 (fichier invalide) |

```typescript
async function callOCRWithRetry(payload: OCRPayload, maxAttempts = 3): Promise<OCRResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callOCR(payload, { timeout: 15_000 });
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      if (isNonRetryableError(e)) throw e; // 400, 401, 403
      const delay = Math.pow(4, attempt) * 500; // 2s, 8s, 32s
      await sleep(delay);
    }
  }
}
```

### 6.4 Validation précision ≥ 85%

Mistral OCR retourne un score de confiance par page. Le champ `ocr_confidence` stocke la moyenne des scores par page.[7][8]

```typescript
function computeConfidence(pages: MistralPage[]): number {
  return pages.reduce((acc, p) => acc + p.confidence, 0) / pages.length;
}
```

Si `ocr_confidence < 0.75`, un avertissement non bloquant est affiché : *"La qualité du scan est faible — la recherche peut être incomplète. Essayez un scan dans de meilleures conditions."*

Le seuil de 0.85 mentionné dans le PRD est un critère de validation du spike — pas un seuil de rejet en production.

### 6.5 Coût OCR — Analyse de viabilité

Mistral OCR 3 est tarifé $2/1 000 pages en standard, $1/1 000 pages en batch. Pour un utilisateur free capturant 30 documents (1 page en moyenne) : **$0.03 par utilisateur free**. Pour un utilisateur Pro capturant 100 docs/mois : **$0.10/mois**. Marge largement couverte par l'abonnement Pro à 8,99€/mois. Ce coût n'est pas bloquant.[9][7]

***

## 7. Sync Cloud

### 7.1 Architecture backend — Modules Fastify

```
fastify-app/
├── modules/
│   ├── auth/          → JWT issue, refresh, logout
│   ├── documents/     → Metadata CRUD, sync endpoints
│   ├── files/         → Presigned URL generation S3
│   ├── ocr/           → Proxy Mistral OCR
│   └── share/         → Gestion liens temporaires
├── plugins/
│   ├── db.ts          → Pool PostgreSQL (pg)
│   ├── s3.ts          → Client AWS SDK v3
│   └── auth.ts        → Validation JWT middleware
```

### 7.2 Modèle de données PostgreSQL

```sql
-- =============================================
-- TABLE : users
-- =============================================
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    TEXT NOT NULL UNIQUE,   -- UUID généré à l'installation mobile
  tier         TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
  doc_count    INTEGER NOT NULL DEFAULT 0,   -- Compteur documents actifs (dénormalisé)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tier CHECK (tier IN ('free', 'pro'))
);

-- =============================================
-- TABLE : documents
-- Source de vérité cloud des métadonnées
-- =============================================
CREATE TABLE documents (
  id                UUID PRIMARY KEY,         -- Même UUID que côté client
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  file_size_bytes   BIGINT NOT NULL,
  tag               TEXT NOT NULL DEFAULT 'Autre',
  ocr_text          TEXT,
  ocr_confidence    NUMERIC(4,3),
  ocr_status        TEXT NOT NULL DEFAULT 'pending',
  s3_key            TEXT,                     -- Clé S3 après upload
  is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL,     -- Timestamp original client
  updated_at        TIMESTAMPTZ NOT NULL,     -- Timestamp original client (LWW source)
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tag CHECK (tag IN (
    'Contrat','Facture','Identité','Administratif','Bancaire','Fiscal','Reçu','Autre'
  )),
  CONSTRAINT chk_mime CHECK (mime_type IN ('application/pdf','image/jpeg','image/png'))
);

CREATE INDEX idx_documents_user_updated ON documents(user_id, updated_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX idx_documents_sync ON documents(user_id, synced_at DESC);

-- =============================================
-- TABLE : share_links
-- =============================================
CREATE TABLE share_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,            -- 32+ chars aléatoires
  expires_at  TIMESTAMPTZ NOT NULL,
  is_revoked  BOOLEAN NOT NULL DEFAULT FALSE,
  access_count INTEGER NOT NULL DEFAULT 0,     -- Compteur accès (observabilité)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_links_token ON share_links(token) WHERE is_revoked = FALSE;
CREATE INDEX idx_share_links_doc ON share_links(document_id);
CREATE INDEX idx_share_links_expiry ON share_links(expires_at) WHERE is_revoked = FALSE;
```

### 7.3 Endpoints REST — Détail complet

#### Auth

```
POST /api/auth/register
Body  : { "device_id": "uuid-v4" }
Resp  : { "access_token": "jwt", "user_id": "uuid", "tier": "free" }
Status: 201 | 409 (device_id already exists)

POST /api/auth/refresh
Header: Authorization: Bearer <expired_token>
Resp  : { "access_token": "jwt" }
Status: 200 | 401

---

GET /api/auth/me
Header: Authorization: Bearer <token>
Resp  : { "user_id": "uuid", "tier": "free|pro", "doc_count": 12 }
Status: 200 | 401
```

#### Documents — Sync

```
GET /api/documents/sync?since=<unix_ms>
Header: Authorization: Bearer <token>
Desc  : Retourne tous les documents modifiés APRÈS le timestamp 'since' (sync incrémentale)
Resp  :
{
  "documents": [
    {
      "id": "uuid",
      "original_filename": "contrat.pdf",
      "mime_type": "application/pdf",
      "file_size_bytes": 204800,
      "tag": "Contrat",
      "ocr_text": "...",
      "ocr_confidence": 0.92,
      "ocr_status": "done",
      "s3_key": "users/uuid/docs/uuid.pdf",
      "is_deleted": false,
      "created_at": 1709042400000,
      "updated_at": 1709042500000
    }
  ],
  "server_timestamp": 1709042600000
}
Status: 200 | 401

---

POST /api/documents/sync
Header: Authorization: Bearer <token>
Desc  : Push de métadonnées depuis le client. Un ou plusieurs documents.
Body  :
{
  "documents": [
    {
      "id": "uuid",
      "original_filename": "facture.pdf",
      "mime_type": "application/pdf",
      "file_size_bytes": 102400,
      "tag": "Facture",
      "ocr_text": "...",
      "ocr_status": "done",
      "is_deleted": false,
      "created_at": 1709042400000,
      "updated_at": 1709042500000
    }
  ]
}
Resp  :
{
  "results": [
    { "id": "uuid", "status": "created" | "updated" | "skipped", "server_updated_at": 1709042600000 }
  ]
}
Status: 200 | 400 | 401 | 403 (quota Free dépassé)
```

**Logique LWW côté serveur** :

```sql
INSERT INTO documents (..., updated_at)
VALUES (...)
ON CONFLICT (id) DO UPDATE
  SET tag = EXCLUDED.tag,
      ocr_text = EXCLUDED.ocr_text,
      is_deleted = EXCLUDED.is_deleted,
      updated_at = EXCLUDED.updated_at,
      synced_at = NOW()
  WHERE EXCLUDED.updated_at > documents.updated_at;
-- Si updated_at client <= updated_at serveur → skipped (LWW)
```

#### Fichiers — Upload/Download

```
POST /api/files/upload-url
Header: Authorization: Bearer <token>
Body  : { "document_id": "uuid", "mime_type": "application/pdf", "file_size_bytes": 204800 }
Desc  : Génère une presigned URL S3 PUT. Le client upload directement sur S3.
Resp  : { "upload_url": "https://s3.amazonaws.com/...", "s3_key": "users/uid/docs/uuid.pdf", "expires_in": 900 }
Status: 200 | 401 | 413 (size > 50 Mo)

---

GET /api/files/download-url/:document_id
Header: Authorization: Bearer <token>
Desc  : Génère une presigned URL S3 GET, valable 15 minutes.
Resp  : { "download_url": "https://s3.amazonaws.com/...", "expires_in": 900 }
Status: 200 | 401 | 403 (not owner) | 404
```

#### OCR

```
POST /api/ocr/process
Header: Authorization: Bearer <token>
Body  : { "document_id": "uuid", "file_base64": "<base64>", "mime_type": "application/pdf" }
Desc  : Proxy vers Mistral OCR. Valide le tier, appelle Mistral, retourne le texte.
Resp  : { "document_id": "uuid", "ocr_text": "...", "confidence": 0.91, "pages": 2 }
Status: 200 | 400 | 401 | 402 (quota dépassé tier free) | 503 (Mistral indisponible)
```

#### Partage

```
POST /api/share
Header: Authorization: Bearer <token>
Body  : { "document_id": "uuid", "expires_in_hours": 24 | 168 | 720 }
Resp  : { "share_id": "uuid", "token": "abc...xyz", "share_url": "https://app.ged.io/s/abc...xyz", "expires_at": 1709129000000 }
Status: 201 | 401 | 403 (not owner) | 404

---

DELETE /api/share/:share_id
Header: Authorization: Bearer <token>
Desc  : Révocation du lien.
Resp  : { "status": "revoked" }
Status: 200 | 401 | 403 | 404

---

GET /api/share/document/:document_id
Header: Authorization: Bearer <token>
Desc  : Retourne le lien actif pour un document (s'il existe).
Resp  : { "share": { "id": "uuid", "token": "...", "expires_at": 1709129000000, "is_revoked": false } | null }
Status: 200 | 401

---

GET /s/:token (public, no auth)
Desc  : Accès public au document partagé. Vérifie expiration et révocation.
Resp  : Redirect vers presigned URL S3 GET (valable 5 minutes) ou page erreur HTML
Status: 302 | 404 | 410 (expiré ou révoqué)
```

### 7.4 Sync incrémentale — Diagramme de séquence

```
CLIENT                          SERVER                      S3
  │                               │                          │
  │── GET /sync?since=0 ─────────►│                          │
  │◄─ { documents: [...] } ───────│                          │
  │   (pull delta complet)        │                          │
  │                               │                          │
  │   [user scans doc]            │                          │
  │   INSERT local SQLite         │                          │
  │                               │                          │
  │── POST /ocr/process ─────────►│                          │
  │◄─ { ocr_text, confidence } ───│                          │
  │   UPDATE local SQLite         │                          │
  │                               │                          │
  │── POST /files/upload-url ────►│                          │
  │◄─ { upload_url, s3_key } ─────│                          │
  │──────────── PUT fichier chiffré ─────────────────────────►│
  │◄────────────────────────────────────── HTTP 200 ──────────│
  │                               │                          │
  │── POST /documents/sync ──────►│                          │
  │   { metadata document }       │   UPSERT (LWW)           │
  │◄─ { status: "created" } ──────│                          │
  │   UPDATE sync_status='synced' │                          │
  │                               │                          │
  │   [réseau coupé]              │                          │
  │   sync_status reste 'pending' │                          │
  │                               │                          │
  │   [réseau revient]            │                          │
  │── GET /sync?since=<last_sync>►│                          │
  │◄─ { documents delta } ────────│                          │
  │── POST /documents/sync ──────►│                          │
  │◄─ { results } ────────────────│                          │
```

### 7.5 Gestion conflits — Last Write Wins

Le champ `updated_at` est le timestamp Unix en millisecondes **de l'horloge cliente au moment de la modification**. Il est immutable côté client une fois créé — toute modification locale incrémente `updated_at` au timestamp courant.

**Risque connu** : les horloges clientes peuvent dériver. Sur Android, la dérive est typiquement < 1 seconde dans des conditions normales. Risque accepté pour le MVP — les conflits réels (modification simultanée du même document depuis deux devices) sont rares dans un contexte solo freelance.

***

## 8. Partage Sécurisé

### 8.1 Génération du token

```typescript
import { randomBytes } from 'crypto';

function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
  // Produit 43 caractères URL-safe, 256 bits d'entropie
}
```

**Base64url** est retenu (pas hex) pour produire des URLs plus courtes tout en maintenant l'entropie. 256 bits = résistant à la recherche exhaustive.

### 8.2 Un seul lien actif par document

Lors de la génération d'un nouveau lien, le lien précédent est révoqué atomiquement :

```sql
BEGIN;
UPDATE share_links
SET is_revoked = TRUE
WHERE document_id = $1 AND is_revoked = FALSE;

INSERT INTO share_links (id, document_id, user_id, token, expires_at)
VALUES (gen_random_uuid(), $1, $2, $3, $4);
COMMIT;
```

### 8.3 Validation à l'accès public

```
GET /s/:token
  1. SELECT * FROM share_links WHERE token = $1 AND is_revoked = FALSE
  2. Si not found → 404
  3. Si expires_at < NOW() → 410 Gone + UPDATE is_revoked=TRUE (cleanup)
  4. Récupérer document → générer presigned URL S3 GET (TTL: 5 min)
  5. Redirect 302 vers presigned URL
  6. UPDATE access_count = access_count + 1
```

### 8.4 Protection brute force et rate limiting

```typescript
// Plugin Fastify rate-limit
fastify.register(import('@fastify/rate-limit'), {
  routeOptions: {
    '/s/:token': {
      max: 20,        // 20 requêtes
      timeWindow: '1 minute',
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: () => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Trop de tentatives. Réessayez dans 1 minute.'
      })
    }
  }
});
```

L'index `idx_share_links_token` rend la lookup O(log n) — la protection rate-limit sur IP est suffisante pour le MVP. Un WAF (CloudFront ou similaire) peut être ajouté en V2.

### 8.5 TTL auto-cleanup

Job cron quotidien (00:00 UTC) :

```sql
UPDATE share_links
SET is_revoked = TRUE
WHERE expires_at < NOW() AND is_revoked = FALSE;
```

Ou via pg_cron si disponible sur l'hébergement. Les lignes révoquées sont conservées 30 jours pour l'audit log, puis supprimées :

```sql
DELETE FROM share_links
WHERE is_revoked = TRUE AND expires_at < NOW() - INTERVAL '30 days';
```

***

## 9. Sécurité Globale

### 9.1 Threat model simplifié

| Vecteur d'attaque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Extraction fichiers depuis device volé (non rooté) | Moyenne | Élevé | Chiffrement AES-256 local + Keychain/Keystore |
| Token JWT volé (MITM) | Faible | Moyen | TLS 1.3 obligatoire, JWT courte durée (1h) + refresh |
| Brute force tokens de partage | Faible | Moyen | 256 bits entropie + rate limiting IP |
| Accès non autorisé à S3 | Faible | Élevé | Presigned URLs, pas d'accès public bucket, IAM restrictif |
| Injection SQL | Faible | Élevé | Requêtes paramétrées exclusivement (pg pool + plugin SQLite) |
| Clé API Mistral exposée | Nulle (si proxy backend) | Élevé | Clé stockée uniquement côté serveur, jamais dans l'app |
| Device rooté / jailbreaké | Faible | Élevé | Risque accepté MVP — Keychain extractible sur jailbreak |

### 9.2 JWT — Configuration

```typescript
// Access token : 1 heure
// Refresh token : 30 jours, rotation à chaque usage
// Payload minimal : { sub: user_id, tier: 'free'|'pro', iat, exp }
// Algorithme : HS256 (MVP) → RS256 recommandé en V2 (multi-instance)
```

### 9.3 S3 — Configuration sécurité

- Bucket `Block all public access` : **activé**
- Versioning : désactivé (inutile, coût supplémentaire, MVP)
- Encryption at rest : S3-SSE (server-side encryption par défaut AWS)
- IAM role backend : `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` uniquement sur le bucket ged — pas de `s3:ListBucket` en production

### 9.4 Risques acceptés en MVP

- Pas de biométrie obligatoire à l'ouverture de l'app
- Pas de certificate pinning (résilience > sécurité pour MVP)
- Rotation de clé non implémentée
- Pas de détection root/jailbreak
- JWT HS256 (symétrique) — acceptable mono-serveur

***

## 10. Scalabilité

### 10.1 Hypothèses de charge

| Métrique | 500 users | 5 000 users | 10 000 users |
|---|---|---|---|
| Documents actifs (avg 50/user) | 25 000 | 250 000 | 500 000 |
| Appels OCR/jour (avg 2/user actif) | 1 000 | 10 000 | 20 000 |
| Coût OCR/mois (Mistral $2/1000p) | ~$60 | ~$600 | ~$1 200 |
| Requêtes API sync/jour (avg 5/user) | 2 500 | 25 000 | 50 000 |
| Stockage S3 (avg 5 Mo/document) | 125 Go | 1,25 To | 2,5 To |

### 10.2 Coût infrastructure approximatif — 10 000 users

| Composant | Specs | Coût/mois estimé |
|---|---|---|
| VPS Backend | 4 vCPU / 8 Go RAM | ~40€ |
| PostgreSQL | 2 vCPU / 4 Go RAM (VPS ou RDS t3.medium) | ~60–80€ |
| AWS S3 | 2,5 To stockage + transfert | ~70–90€ |
| CloudFront | CDN pour presigned downloads | ~20–30€ |
| Mistral OCR | ~$1 200 (voir ci-dessus) | ~1 100€ |
| **Total** | | **~1 300–1 350€/mois** |

À 10 000 users avec 5% Pro (500 × 8,99€) : MRR ~4 500€. Marge brute positive après infra.

### 10.3 Points de saturation identifiés

1. **PostgreSQL** : premier bottleneck prévisible à ~5 000 users actifs avec sync fréquente. Mitigation : index sur `(user_id, updated_at)` + connection pooling (PgBouncer). Read replica en V2.
2. **VPS Backend** : stateless par design → horizontal scaling trivial (load balancer + 2 instances) si nécessaire.
3. **Mistral OCR rate limits** : Tier 1 (< $20 dépensé) = 60 req/min. Au-delà de $20 dépensés → Tier 2 automatique. Mitigation MVP : queue locale côté backend avec concurrence max = 30 appels/min.[10]
4. **S3** : pas de bottleneck réaliste à cette échelle. S3 supporte nativement plusieurs milliers de requêtes/seconde.

***

## 11. Observabilité

### 11.1 Logs locaux (mobile)

Implémenté via un `LogService` qui écrit dans une table SQLite dédiée :

```sql
CREATE TABLE IF NOT EXISTS local_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL, -- 'debug' | 'info' | 'warn' | 'error'
  context    TEXT NOT NULL, -- 'OCR' | 'SYNC' | 'CRYPTO' | 'SHARE' | 'UI'
  message    TEXT NOT NULL,
  metadata   TEXT,          -- JSON stringifié
  created_at INTEGER NOT NULL
);
-- Purge automatique : DELETE WHERE created_at < NOW() - 7 jours
```

**Les logs locaux ne quittent jamais le device en production** sauf si l'utilisateur active explicitement un mode debug dans les settings (V2).

### 11.2 Logs backend

Format JSON structuré via `pino` (logger Fastify natif) :

```json
{
  "time": "2026-02-27T10:00:00Z",
  "level": "error",
  "context": "sync",
  "user_id": "uuid",
  "document_id": "uuid",
  "operation": "upload",
  "error": "S3 PutObject timeout",
  "duration_ms": 15032,
  "attempt": 2
}
```

Niveau `info` par défaut. Niveau `debug` activable par variable d'environnement `LOG_LEVEL=debug`.

### 11.3 Crash reporting

**Sentry** (SDK Capacitor) — intégré côté mobile uniquement. Capture les erreurs non gérées avec stacktrace. **PII explicitement exclu** : pas de `ocr_text`, pas de noms de fichiers dans les breadcrumbs Sentry.

### 11.4 Monitoring sync failures

Endpoint interne (non exposé publiquement) :

```
GET /internal/metrics
Resp :
{
  "sync_errors_last_1h": 12,
  "ocr_errors_last_1h": 3,
  "share_accesses_last_24h": 47,
  "active_users_last_7d": 423
}
```

Alerte automatique si `sync_errors_last_1h > 50` → notification Slack/email ops.

### 11.5 Métriques techniques critiques

| Métrique | Seuil alerte | Source |
|---|---|---|
| Latence P95 sync API | > 3 secondes | Logs Fastify |
| Taux d'erreur OCR | > 10% sur 1h glissante | Table `sync_log` |
| Documents `sync_status='error'` > 24h | > 5% des documents actifs | Cron query PostgreSQL |
| Liens de partage accédés après expiration | > 0 (ne doit jamais arriver) | Logs `/s/:token` |
| Espace S3 utilisé | > 80% budget estimé | AWS CloudWatch |

***

## 12. Trade-offs et Dettes Acceptées

| Dette | Impact | Trigger pour traiter |
|---|---|---|
| **Rotation de clé non implémentée** | Si la clé est compromise, tous les documents locaux sont exposés | > 10 000 users actifs ou incident sécurité |
| **JWT HS256 (clé symétrique)** | Incompatible avec architecture multi-serveur sans partage de secret | Passage à 2+ instances backend |
| **LWW basé sur horloge client** | Dérive horloge théoriquement possible — conflit silencieux rare mais possible | Si usage multi-device validé (V2) |
| **Détection bords en JS WebView** | Moins performant que plugin natif sur devices bas de gamme | Si taux de satisfaction scan < 80% en feedback utilisateur |
| **Pas de certificate pinning** | Vulnérable à MITM sur réseau compromis (rare) | Avant expansion vers professions réglementées |
| **Pas de détection root/jailbreak** | Chiffrement bypassable sur device compromis | Avant ciblage professions à obligation légale |
| **Presigned URLs S3 exposées au navigateur** | Le fichier transite en clair côté S3 (SSE-S3) — pas de chiffrement E2E cloud | Si obligation RGPD renforcée ou cible réglementée |
| **Pas de biométrie obligatoire** | App accessible sans authentification forte après déverrouillage device | Demande utilisateur ou segment pro réglementé |
| **Queue OCR mono-thread** | Un document bloque le suivant | Si temps moyen OCR > 8 secondes en production |
| **Pas de pagination serveur sur /sync** | Si un user a > 5 000 documents, la première sync est lourde | Dès que la P95 de la réponse /sync dépasse 3s |

***

*Ce document constitue le blueprint technique complet pour la phase de génération automatisée des spécifications API, modèles de données et découpage en tâches. Toute ambiguïté identifiée dans un agent downstream doit être remontée comme issue sur ce document avant implémentation.*

Sources
[1] Comparing Fastify, Hono, and NestJS for Modern Web Development https://redskydigital.com/gb/comparing-fastify-hono-and-nestjs-for-modern-web-development/
[2] NestJS vs SonicJS vs Hono: Backend Framework Comparison 2026 https://sonicjs.com/blog/nestjs-vs-sonicjs-vs-hono
[3] Convert Your Nuxt App to iOS & Android with Capacitor 8 - Capgo https://capgo.app/blog/building-a-native-mobile-app-with-nuxt-and-capacitor/
[4] SQLite Plugin for Capacitor - Capawesome https://capawesome.io/plugins/sqlite/
[5] Encrypting SQLite databases in Capacitor - Capawesome https://capawesome.io/blog/encrypting-capacitor-sqlite-database/
[6] Secure Storage for Offline Tokens in Capacitor - Capgo https://capgo.app/blog/secure-storage-for-offline-tokens-in-capacitor/
[7] Mistral OCR 3 Technical Review: SOTA Document Parsing at ... https://pyimagesearch.com/2025/12/23/mistral-ocr-3-technical-review-sota-document-parsing-at-commodity-pricing/
[8] Mistral OCR: A Deep Dive into Next-Generation Document ... - Cohorte https://www.cohorte.co/blog/mistral-ocr-a-deep-dive-into-next-generation-document-understanding
[9] Introducing Mistral OCR 3 https://mistral.ai/news/mistral-ocr-3
[10] How do API rate limits work and how do I increase them? | Mistral AI https://help.mistral.ai/en/articles/424390-how-do-api-rate-limits-work-and-how-do-i-increase-them
[11] Capacitor Plugins for Secure Session Management - Capgo https://capgo.app/blog/capacitor-plugins-for-secure-session-management/
[12] capgo/capacitor-zip 8.1.5 on npm - Libraries.io https://libraries.io/npm/@capgo%2Fcapacitor-zip
[13] AES256 | Ionic日本語ドキュメンテーション https://ionicframework.jp/docs/v5/native/aes-256/
[14] capacitor-offline-first skill by cap-go/capacitor-skills - playbooks https://playbooks.com/skills/cap-go/capacitor-skills/capacitor-offline-first
[15] Fastify vs. Hono – Which Wins for High-Throughput APIs? https://dev.to/alex_aslam/beyond-express-fastify-vs-hono-which-wins-for-high-throughput-apis-373i
[16] Turso Cloud Works with Capacitor https://turso.tech/blog/turso-cloud-works-with-capacitor
[17] aparajita/capacitor-secure-storage - GitHub https://github.com/aparajita/capacitor-secure-storage
[18] Capacitor, SQL Database, and offline data mode questions https://forum.ionicframework.com/t/capacitor-sql-database-and-offline-data-mode-questions/219177
[19] Capacitor by Ionic - Cross-platform apps with web technology https://capacitorjs.com
[20] Capacitor (alpha) - PowerSync https://docs.powersync.com/client-sdk-references/capacitor
[21] Pricing - Mistral AI https://mistral.ai/pricing
[22] Mistral AI's 2025 Pricing: A Look at the Latest Models and Their Costs http://oreateai.com/blog/mistral-ais-2025-pricing-a-look-at-the-latest-models-and-their-costs/e0c23388fac40b1710766b47a517e1de
[23] Análisis de los límites de cuota y velocidad de la API de Mistral para ... https://www.reddit.com/r/MistralAI/comments/1rc8rwf/mistral_api_quota_and_rate_limits_pools_analysis/
[24] Mistral OCR Rate limit https://www.reddit.com/r/MistralAI/comments/1j9gq3a/mistral_ocr_rate_limit/
[25] Secure file sharing solutions in AWS: A security and cost analysis ... https://aws.amazon.com/blogs/security/how-to-securely-transfer-files-with-presigned-urls/
[26] GitHub - joohw/delta-sync: A lightweight framework for bi-directional database synchronization with automatic version tracking and conflict resolution. https://github.com/joohw/delta-sync
[27] The Architecture That Lets Us Sleep: Scalable Uploads with S3 ... https://dev.to/oliverke/the-architecture-that-lets-us-sleep-scalable-uploads-with-s3-presigned-urls-1jf3
[28] Sync Postgres with SQLite https://www.powersync.com/sync-postgres
[29] Download and upload objects with presigned URLs https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
[30] Using Delta Sync operations on versioned data sources in AWS ... https://docs.aws.amazon.com/appsync/latest/devguide/tutorial-delta-sync.html
[31] Amazon S3 – Pre-Signed URLs: My Experience Making File Sharing ... https://dev.to/aws-builders/amazon-s3-pre-signed-urls-my-experience-making-file-sharing-easier-3i4p
