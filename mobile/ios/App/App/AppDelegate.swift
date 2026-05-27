import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private let appGroupID = "group.be.studiofnk.tidy"
    private let stagingFolder = "tidy_share_inbox"

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        syncShareInboxToDocuments()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        syncShareInboxToDocuments()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

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

    private func syncShareInboxToDocuments() {
        NSLog("[Tidy][ShareInbox] syncShareInboxToDocuments() appelé")
        let fileManager = FileManager.default

        guard let groupContainerURL = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        ) else {
            NSLog("[Tidy][ShareInbox] ⛔ App Group container introuvable — vérifie les Capabilities Xcode")
            return
        }

        NSLog("[Tidy][ShareInbox] Group container : \(groupContainerURL.path)")

        let sourceInboxURL = groupContainerURL.appendingPathComponent(stagingFolder, isDirectory: true)

        guard let documentsRootURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
            NSLog("[Tidy][ShareInbox] Dossier inbox App Group vide ou inexistant : \(sourceInboxURL.path)")
            return
        }

        let destinationInboxURL = documentsRootURL.appendingPathComponent(stagingFolder, isDirectory: true)

        do {
            try fileManager.createDirectory(
                at: destinationInboxURL,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            print("[Tidy][ShareInbox] Impossible de créer le dossier Documents inbox: \(error)")
            return
        }

        guard fileManager.fileExists(atPath: sourceInboxURL.path) else {
            return
        }

        let fileURLs: [URL]
        do {
            fileURLs = try fileManager.contentsOfDirectory(
                at: sourceInboxURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        } catch {
            print("[Tidy][ShareInbox] Impossible de lire le dossier App Group inbox: \(error)")
            return
        }

        for fileURL in fileURLs {
            let destinationURL = destinationInboxURL.appendingPathComponent(fileURL.lastPathComponent)

            do {
                if fileManager.fileExists(atPath: destinationURL.path) {
                    try fileManager.removeItem(at: destinationURL)
                }

                try fileManager.copyItem(at: fileURL, to: destinationURL)
                try fileManager.removeItem(at: fileURL)
            } catch {
                print("[Tidy][ShareInbox] Échec du déplacement \(fileURL.lastPathComponent): \(error)")
            }
        }
    }
}
