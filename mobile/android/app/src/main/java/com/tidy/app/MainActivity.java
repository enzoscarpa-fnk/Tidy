package com.tidy.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;

public class MainActivity extends BridgeActivity {

    private static final String TAG             = "TidyShare";
    private static final String STAGING_FOLDER  = "tidy_share_inbox";
    private static final long   MAX_SIZE_BYTES  = 50L * 1024L * 1024L;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null) {
                bridge.getWebView().getSettings().setMixedContentMode(
                    android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                );
            }

            handleShareIntent(getIntent());
        }

    /**
     * Appelé quand l'app est déjà en cours d'exécution (launchMode="singleTask")
     * et qu'une nouvelle intention de partage arrive.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    // ── Handling intent ───────────────────────────────────────────────────────

    private void handleShareIntent(Intent intent) {
        if (intent == null) return;

        String action   = intent.getAction();
        String mimeType = intent.getType();

        if (!Intent.ACTION_SEND.equals(action) || mimeType == null) return;

        if (!isSupportedMimeType(mimeType)) {
            Log.w(TAG, "Type MIME non supporté : " + mimeType);
            return;
        }

        Uri sharedUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (sharedUri == null) {
            Log.w(TAG, "Intent ACTION_SEND sans EXTRA_STREAM — ignoré");
            return;
        }

        copyToStagingFolder(sharedUri, mimeType);
    }

    private boolean isSupportedMimeType(String mimeType) {
        return "application/pdf".equals(mimeType)
                || "image/jpeg".equals(mimeType)
                || "image/png".equals(mimeType);
    }

    // ── Copie vers le dossier staging ─────────────────────────────────────────

    private void copyToStagingFolder(Uri sourceUri, String mimeType) {
        try {
            // getFilesDir() = Directory.Data côté Capacitor Filesystem
            File stagingDir = new File(getFilesDir(), STAGING_FOLDER);
            if (!stagingDir.exists() && !stagingDir.mkdirs()) {
                Log.e(TAG, "Impossible de créer le dossier staging : " + stagingDir);
                return;
            }

            InputStream inputStream = getContentResolver().openInputStream(sourceUri);
            if (inputStream == null) {
                Log.e(TAG, "Impossible d'ouvrir le flux pour : " + sourceUri);
                return;
            }

            String fileId          = UUID.randomUUID().toString().toLowerCase();
            String extension       = extensionForMimeType(mimeType);
            String binaryFilename  = fileId + "." + extension;
            String originalName    = resolveOriginalFilename(sourceUri, "shared." + extension);

            // Copier le binaire
            File destFile  = new File(stagingDir, binaryFilename);
            long fileSize  = copyStream(inputStream, destFile);
            inputStream.close();

            if (fileSize <= 0) {
                destFile.delete();
                Log.e(TAG, "Fichier vide après copie — annulé");
                return;
            }

            if (fileSize > MAX_SIZE_BYTES) {
                destFile.delete();
                Log.w(TAG, "Fichier trop volumineux (" + fileSize + " bytes) — ignoré");
                return;
            }

            // Écrire le manifest JSON (même format que la ShareExtension iOS)
            writeManifest(stagingDir, fileId, originalName, mimeType, fileSize, binaryFilename);

            Log.i(TAG, "✓ Fichier stagé : " + binaryFilename + " (" + fileSize + " bytes)");

        } catch (Exception e) {
            Log.e(TAG, "Erreur lors du staging du fichier partagé", e);
        }
    }

    private long copyStream(InputStream in, File dest) throws IOException {
        long totalBytes = 0;
        byte[] buffer = new byte[8192];
        int bytesRead;
        try (OutputStream out = new FileOutputStream(dest)) {
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
                totalBytes += bytesRead;
            }
        }
        return totalBytes;
    }

    private void writeManifest(
            File stagingDir,
            String fileId,
            String originalFilename,
            String mimeType,
            long fileSize,
            String binaryFilename
    ) throws Exception {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));

        JSONObject manifest = new JSONObject();
        manifest.put("id",             fileId);
        manifest.put("filename",       originalFilename);
        manifest.put("mimeType",       mimeType);
        manifest.put("title",          filenameWithoutExtension(originalFilename));
        manifest.put("fileSizeBytes",  fileSize);
        manifest.put("sharedAt",       sdf.format(new Date()));
        manifest.put("binaryFilename", binaryFilename);

        File manifestFile = new File(stagingDir, fileId + ".manifest.json");
        try (FileOutputStream fos = new FileOutputStream(manifestFile)) {
            fos.write(manifest.toString().getBytes("UTF-8"));
        }

        Log.i(TAG, "✓ Manifest écrit : " + manifestFile.getName());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Tente de récupérer le nom d'affichage du fichier via le ContentResolver.
     * Utile pour les URI content:// (Google Drive, Gmail, Fichiers, etc.)
     */
    private String resolveOriginalFilename(Uri uri, String fallback) {
        try (Cursor cursor = getContentResolver().query(
                uri,
                new String[]{ OpenableColumns.DISPLAY_NAME },
                null, null, null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception ignored) {}
        return fallback;
    }

    private String extensionForMimeType(String mimeType) {
        switch (mimeType) {
            case "application/pdf": return "pdf";
            case "image/png":       return "png";
            case "image/jpeg":      return "jpg";
            default:                return "bin";
        }
    }

    private String filenameWithoutExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return (dot > 0) ? filename.substring(0, dot) : filename;
    }
}
