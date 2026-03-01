# 📄 Tidy — Your Documents, Always at Hand

> *Scan. Find in 10 seconds. Share safely.*

**Tidy** is a mobile-first document manager for freelancers and independent workers. It lets you capture, search, and securely share your professional documents — contracts, invoices, tax records, ID papers — directly from your phone, even without an internet connection.

---

## 💡 Why Tidy?

Freelancers and micro-entrepreneurs constantly deal with documents arriving from all directions: email PDFs, scanned paper, WhatsApp attachments, client invoices. They end up scattered across different apps, devices, and folders. When a client or accountant asks for something specific, finding it becomes a non-deterministic exercise.

Tidy's promise is simple: **any document you've ever scanned or imported should be retrievable in under 10 seconds**, directly from your phone, without depending on a network connection.

---

## 🎯 Who Is It For?

- **Freelancers & independent workers** — manage contracts, quotes, invoices, and tax documents from a reliable mobile tool
- **Micro-entrepreneurs** — centralise all your professional paperwork without complex software
- **Individuals** — store identity papers, medical records, and administrative documents securely on your device

Primary markets: France, Belgium, Switzerland (French-speaking Europe — ~4.5 million independent workers).

---

## ✨ Core Features (MVP)

### 📷 Smart Capture
- Scan paper documents via the native camera with automatic edge detection (OpenCV.js)
- Import PDFs and images from any third-party app via the native iOS Share Extension or Android Intent Filter
- Automatic OCR powered by **Mistral OCR** (called securely via the backend proxy — the API key never touches your device)

### 🔍 Full-Text Search
- Search inside the extracted text of any document
- Filter by category (Invoice, Contract, ID, Tax, Banking, Receipt, Other), tags, and date
- Offline-first: search runs locally against a SQLite FTS5 index, no network needed

### 🔒 Offline-First & Encrypted
- All files are encrypted on-device using **AES-256-GCM** via a native Capacitor plugin (never in JavaScript/WebView)
- The SQLite database itself is encrypted with the same key, stored in iOS Keychain / Android Keystore
- Documents are accessible with no internet connection — sync happens silently in the background when connectivity returns
- Conflict resolution uses a **Last Write Wins** strategy based on client-side timestamps

### 🔗 Secure Sharing
- Generate a temporary shareable link per document (24h, 7 days, or 30 days)
- Recipients can access the document without creating an account
- Links are manually revocable at any time
- No collaboration, annotation, or co-editing in V1 — by design

---

## 🛠️ Technical Architecture

Tidy is built on a **decoupled mobile client / backend API** architecture, designed to be lean for MVP and scale-ready for growth.

### Mobile Client — Nuxt 3 + Capacitor
- **Nuxt 3** in SPA mode (`ssr: false`) rendered inside a native **Capacitor** WebView
- Runs natively on **iOS 16+** and **Android 11+**
- **Vue 3** (Composition API, TypeScript strict) + **Pinia** for state management + **Tailwind CSS**
- Local persistence via **`@capacitor-awesome/capacitor-sqlite`** (encrypted, FTS5 full-text search)
- Native plugins: camera, filesystem, secure storage, network detection, share sheet, app lifecycle

### Backend — Fastify + Node.js
- **Fastify** (Node.js 20 LTS) chosen over NestJS for its lower cold-start (~100ms vs 500–2000ms), lower memory footprint (~30MB vs 120MB), and built-in JSON schema performance — appropriate for a small team moving fast
- **Modular monolith** architecture with 6 isolated modules: `Auth`, `User`, `Workspace`, `Document`, `Processing`, `Search/Share`
- **Prisma ORM** + **PostgreSQL** for server-side persistence
- **AWS S3** for encrypted file storage (presigned URLs for direct upload/download)
- **Mistral OCR** as the AI backbone for text extraction (proxied through the backend)

### Infrastructure (MVP)
- VPS (4 vCPU / 8 GB RAM) for the Fastify backend
- PostgreSQL with full-text search (GIN index on `tsvector`)
- AWS S3 Standard for file storage
- Docker Compose for local development

### Infrastructure (Post-launch)
- AWS EC2 / Lightsail, RDS (PostgreSQL managed), CloudFront CDN for presigned downloads
- Horizontal scaling is straightforward: the backend is stateless by design

---

## 🔐 Security Model

- **Files**: AES-256-GCM encryption on-device via native plugin; IV + AuthTag prepended to ciphertext
- **Database**: SQLite passphrase-encrypted (same key, stored in Keychain/Keystore)
- **Transport**: TLS 1.3 enforced end-to-end
- **Authentication**: JWT (HS256, 1h access token) + 30-day rotating refresh tokens with cascade revocation
- **S3**: All-public-access blocked; IAM restricted to `GetObject`, `PutObject`, `DeleteObject` only
- **OCR proxy**: The Mistral API key never leaves the backend — not shipped in the mobile bundle
- **Share links**: 256-bit entropy tokens, rate-limited per IP, automatically expired server-side

---

## 🗺️ Development Plan

The MVP is structured into **14 sequential phases** with 100+ tickets, designed for AI-assisted development (Cursor/Cline/Aider):

| Phase | Scope |
|-------|-------|
| 1 | Infrastructure setup (Fastify, Docker, Prisma, CI) |
| 2 | Backend auth (register, login, JWT refresh) |
| 3 | Backend workspaces (CRUD, invariants) |
| 4 | Backend document pipeline (upload, OCR, async processing) |
| 5 | Backend sync, full-text search, share links |
| 6 | Frontend init (Nuxt SPA, auth pages, Pinia, SecureStorage) |
| 7 | Frontend workspace dashboard (document list, polling, skeleton states) |
| 8 | Frontend document UI (upload, detail view, metadata editing) |
| 9 | Frontend search (FTS, tag filters) |
| 10 | Frontend SQLite offline base (schema, migrations, FTS5, encryption) |
| 11 | Frontend sync service (pull/push LWW, OCR queue, S3 upload, network listener) |
| 12 | Frontend share feature (share modal, revocation, native share sheet) |
| 13 | Capacitor native (camera scan, edge detection, iOS/Android import, logging) |
| 14 | QA, polish & App Store release prep |

---

## 📊 MVP Success Criteria

- 500 active users within 120 days of launch
- Free → Pro conversion rate ≥ 5% at 180 days
- App Store rating ≥ 4.2 after 50 reviews
- Zero user data loss incidents
- OCR accuracy ≥ 85% validated on a real-world corpus of 50 documents
- Full-text search response < 1 second on Android (3 GB RAM)

---

## 📁 Repository Structure

```
tidy/
├── backend/          # Fastify + TypeScript + Prisma
│   ├── src/
│   │   ├── modules/  # auth, user, workspace, document, processing, share
│   │   ├── infra/    # database (Prisma), storage (S3), OCR (Mistral)
│   │   └── shared/   # event bus, error handler, auth middleware
│   └── prisma/       # schema.prisma + migrations
└── mobile/           # Nuxt 3 SPA + Capacitor
    ├── pages/        # Nuxt file-system routing
    ├── components/   # Smart & Dumb Vue components
    ├── stores/       # Pinia stores (auth, workspace, document, search, share)
    ├── composables/  # useTidyApi, useSyncService, useDatabaseService, useFileSystem...
    └── capacitor.config.ts
```

---

## ⚠️ Known Technical Trade-offs (MVP)

- **No key rotation**: If the local encryption key is compromised, all local files are exposed. Planned for V2.
- **JWT HS256**: Symmetric key — will need RS256 if/when scaling to multiple backend instances.
- **LWW clock drift**: Client timestamps drive conflict resolution; simultaneous multi-device edits may produce silent conflicts (rare for solo freelance use case).
- **Edge detection in WebView**: OpenCV.js is used instead of native Vision Framework (iOS) / ML Kit (Android). Acceptable for MVP; native plugin planned for V2 if user satisfaction dips.
- **No biometric lock**: App is accessible after device unlock without additional authentication. Planned for V2.
- **Single-threaded OCR queue**: One document is processed at a time. Acceptable unless average OCR latency exceeds 8s in production.

---

*Tidy is currently in active development. All blueprints and technical specifications are versioned in the project knowledge base.*
