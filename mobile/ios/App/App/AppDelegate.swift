import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private let appGroupID    = "group.be.studiofnk.tidy"
    private let stagingFolder = "tidy_share_inbox"

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        drainShareInbox()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {
        // applicationWillEnterForeground est appelé AVANT applicationDidBecomeActive.
        // Le drain ici garantit que les fichiers sont en place avant que le bridge
        // Capacitor n'émette appStateChange { isActive: true } dans la WebView.
        drainShareInbox()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }

    // ── Drain App Group → Library/tidy_share_inbox/ ───────────────────────────
    //
    // La ShareExtension écrit dans le App Group container (seul espace partagé
    // entre l'extension et l'app principale).
    // Capacitor Filesystem avec Directory.Library pointe vers Library/ du sandbox
    // de l'app principale — inaccessible depuis l'extension.
    // Ce drain est le seul pont possible entre les deux sandboxes.

    private func drainShareInbox() {
        NSLog("[Tidy][ShareInbox] drainShareInbox() appelé")

        let fileManager = FileManager.default

        guard let groupContainerURL = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        ) else {
            NSLog("[Tidy][ShareInbox] ⛔ App Group container introuvable — vérifie les Capabilities Xcode")
            return
        }

        // Directory.Library côté Capacitor = Library/ du sandbox de l'app principale
        guard let libraryURL = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first else {
            NSLog("[Tidy][ShareInbox] ⛔ Library directory introuvable")
            return
        }

        let sourceURL = groupContainerURL.appendingPathComponent(stagingFolder, isDirectory: true)
        let destURL   = libraryURL.appendingPathComponent(stagingFolder, isDirectory: true)

        // Créer la destination si elle n'existe pas encore
        do {
            try fileManager.createDirectory(at: destURL, withIntermediateDirectories: true)
        } catch {
            NSLog("[Tidy][ShareInbox] ⛔ Impossible de créer Library/\(stagingFolder) : \(error)")
            return
        }

        guard fileManager.fileExists(atPath: sourceURL.path) else {
            NSLog("[Tidy][ShareInbox] App Group inbox vide — rien à drainer")
            return
        }

        let entries: [URL]
        do {
            entries = try fileManager.contentsOfDirectory(
                at: sourceURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        } catch {
            NSLog("[Tidy][ShareInbox] ⛔ Lecture App Group inbox impossible : \(error)")
            return
        }

        for entry in entries {
            let target = destURL.appendingPathComponent(entry.lastPathComponent)
            do {
                if fileManager.fileExists(atPath: target.path) {
                    try fileManager.removeItem(at: target)
                }
                // move (pas copy) : libère le App Group container immédiatement
                try fileManager.moveItem(at: entry, to: target)
                NSLog("[Tidy][ShareInbox] ✓ \(entry.lastPathComponent) → Library/\(stagingFolder)/")
            } catch {
                NSLog("[Tidy][ShareInbox] ✗ Échec drain \(entry.lastPathComponent) : \(error)")
            }
        }
    }
}
