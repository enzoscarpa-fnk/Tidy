import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tidy.app',
  appName: 'Tidy',
  webDir: '.output/public',

  // Serveur de dev Nuxt (uniquement en développement local)
  // Commenter ce bloc pour un build de production
//  server: {
//    url: 'http://localhost:3001',
//    cleartext: true,
//  },

  plugins: {
    // @capacitor-community/sqlite : chiffrement AES-256 de la base locale
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'tidy',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: 'Accès à Tidy',
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: 'Accès à Tidy',
      },
      electronIsEncryption: true,
      electronWindowsLocation: 'C:\\ProgramData\\CapacitorDatabases',
      electronMacLocation: '/Users/Shared/CapacitorDatabases',
      electronLinuxLocation: 'Databases',
    },

    // @capacitor/filesystem : répertoire racine pour les fichiers chiffrés
    Filesystem: {
      // Les fichiers sont écrits dans le répertoire Documents de l'app
      // (exclu de la sauvegarde iCloud pour les données sensibles)
    },

    // @capacitor/camera : permissions
    Camera: {
      // Sur iOS, la description est gérée dans Info.plist
      // Sur Android, dans AndroidManifest.xml
    },
  },
}

export default config
