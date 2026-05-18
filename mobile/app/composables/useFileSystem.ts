// Wrapper @capacitor/filesystem pour la gestion des fichiers chiffrés.
// Le chiffrement AES-256-GCM est délégué au plugin natif Capacitor —
// jamais implémenté en JS WebView pour des raisons de sécurité.
//
// Conventions :
//   - Les fichiers sont stockés dans Directory.Data (exclu des sauvegardes iCloud)
//   - Nommage : {documentId}.{extension}.enc pour les fichiers chiffrés
//   - IV (12 bytes) + AuthTag (16 bytes) sont gérés par le plugin natif
//   - readRawFile() retourne le ciphertext brut pour l'upload S3 (pas de déchiffrement)

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

// ── Constantes ─────────────────────────────────────────────────────────────

const FILES_DIR = 'tidy_documents'

// ── Helpers privés ─────────────────────────────────────────────────────────

/**
 * Construit le chemin relatif d'un fichier dans le répertoire Documents de l'app.
 */
function _buildPath(documentId: string, extension: string, encrypted: boolean): string {
  const suffix = encrypted ? '.enc' : ''
  return `${FILES_DIR}/${documentId}.${extension}${suffix}`
}

/**
 * S'assure que le répertoire de stockage existe.
 * Idempotent — ne throw pas si le dossier existe déjà.
 */
async function _ensureDirectory(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: FILES_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // Le répertoire existe déjà — ignorer l'erreur
  }
}

// ── Composable public ──────────────────────────────────────────────────────

export function useFileSystem() {
  /**
   * Sauvegarde un fichier chiffré sur le disque natif.
   *
   * Le chiffrement AES-256-GCM est appliqué par le plugin Capacitor natif.
   * Le buffer est encodé en base64 avant d'être transmis au plugin.
   *
   * Retourne le chemin local relatif (stocké dans documents.local_path en SQLite).
   */
  async function saveEncryptedFile(
    documentId: string,
    buffer: ArrayBuffer,
    extension: string
  ): Promise<string> {
    if (!import.meta.client) {
      throw new Error('[FileSystem] saveEncryptedFile : environnement non-client.')
    }

    await _ensureDirectory()

    const path = _buildPath(documentId, extension, true)

    // Convertir ArrayBuffer → base64 pour le plugin Filesystem
    const uint8 = new Uint8Array(buffer)
    const binary = uint8.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
    const base64 = btoa(binary)

    // Le chiffrement natif est activé via la config Capacitor (capacitor.config.ts)
    // iosIsEncryption + androidIsEncryption → AES-256-GCM automatique
    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Data,
    })

    return path
  }

  /**
   * Lit et déchiffre un fichier natif.
   * Retourne le contenu sous forme d'ArrayBuffer.
   *
   * Utilisé pour afficher/lire un document en offline.
   */
  async function readDecryptedFile(localPath: string): Promise<ArrayBuffer> {
    if (!import.meta.client) {
      throw new Error('[FileSystem] readDecryptedFile : environnement non-client.')
    }

    const result = await Filesystem.readFile({
      path: localPath,
      directory: Directory.Data,
    })

    // Le plugin retourne le contenu base64 déchiffré automatiquement
    const base64 = result.data as string

    // Convertir base64 → ArrayBuffer
    const binary = atob(base64)
    const buffer = new ArrayBuffer(binary.length)
    const view = new Uint8Array(buffer)
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i)
    }
    return buffer
  }

  /**
   * Lit le ciphertext brut d'un fichier SANS le déchiffrer.
   * Utilisé exclusivement pour l'upload S3 :
   * le fichier chiffré est envoyé tel quel vers le bucket —
   * seul le backend (ou le device owner) peut le déchiffrer.
   *
   * Retourne le contenu base64 brut tel que stocké sur le disque.
   */
  async function readRawFile(localPath: string): Promise<string> {
    if (!import.meta.client) {
      throw new Error('[FileSystem] readRawFile : environnement non-client.')
    }

    // readFile sans option de déchiffrement → ciphertext brut en base64
    const result = await Filesystem.readFile({
      path: localPath,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })

    return result.data as string
  }

  /**
   * Supprime un fichier du disque natif.
   * Silencieux si le fichier n'existe pas.
   */
  async function deleteFile(localPath: string): Promise<void> {
    if (!import.meta.client) return

    try {
      await Filesystem.deleteFile({
        path: localPath,
        directory: Directory.Data,
      })
    } catch {
      // Fichier déjà supprimé ou chemin invalide — ignorer
    }
  }

  /**
   * Vérifie si un fichier existe sur le disque natif.
   * Utile pour le SyncService avant de tenter un upload.
   */
  async function fileExists(localPath: string): Promise<boolean> {
    if (!import.meta.client) return false

    try {
      await Filesystem.stat({
        path: localPath,
        directory: Directory.Data,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Retourne l'URI native d'un fichier (file:// sur iOS/Android).
   * Utilisé pour afficher un PDF dans une WebView native ou l'ouvrir
   * avec une app tierce via @capacitor/share.
   */
  async function getFileUri(localPath: string): Promise<string | null> {
    if (!import.meta.client) return null

    try {
      const result = await Filesystem.getUri({
        path: localPath,
        directory: Directory.Data,
      })
      return result.uri
    } catch {
      return null
    }
  }

  return {
    saveEncryptedFile,
    readDecryptedFile,
    readRawFile,
    deleteFile,
    fileExists,
    getFileUri,
  }
}
