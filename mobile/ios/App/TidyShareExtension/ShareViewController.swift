import Social
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {

    private let appGroupID = "group.be.studiofnk.tidy"
    private let stagingFolder = "tidy_share_inbox"
    private let maxFileSizeBytes = 50 * 1024 * 1024

    private let acceptedUTTypes: [UTType] = [
        .pdf,
        .jpeg,
        .png,
    ]

    override func isContentValid() -> Bool {
        true
    }

    override func configurationItems() -> [Any]! {
        []
    }

    override func didSelectPost() {
        NSLog("[TidyShare] didSelectPost() déclenché")
        processSharedItems()
    }

    private func processSharedItems() {
        guard
            let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
            let attachments = extensionItem.attachments,
            !attachments.isEmpty
        else {
            cancelWithError("Aucune pièce jointe à importer.")
            return
        }

        let group = DispatchGroup()
        let stateQueue = DispatchQueue(label: "be.studiofnk.tidy.share.state")
        var firstError: Error?
        var processedCount = 0

        for provider in attachments {
            guard let matchedType = acceptedUTTypes.first(where: {
                provider.hasItemConformingToTypeIdentifier($0.identifier)
            }) else {
                continue
            }

            group.enter()

            if #available(iOS 14.0, *) {
                provider.loadFileRepresentation(forTypeIdentifier: matchedType.identifier) { [weak self] fileURL, error in
                    guard let self = self else {
                        group.leave()
                        return
                    }

                    defer { group.leave() }

                    if let error = error {
                        stateQueue.sync {
                            if firstError == nil { firstError = error }
                        }
                        return
                    }

                    guard let fileURL = fileURL else {
                        stateQueue.sync {
                            if firstError == nil { firstError = ShareError.invalidSharedItem }
                        }
                        return
                    }

                    do {
                        try self.copyToGroupContainer(
                            sourceURL: fileURL,
                            fallbackFilename: fileURL.lastPathComponent,
                            mimeType: matchedType.preferredMIMEType ?? "application/octet-stream"
                        )
                        stateQueue.sync { processedCount += 1 }
                    } catch {
                        stateQueue.sync {
                            if firstError == nil { firstError = error }
                        }
                    }
                }
            } else {
                provider.loadItem(forTypeIdentifier: matchedType.identifier, options: nil) { [weak self] item, error in
                    guard let self = self else {
                        group.leave()
                        return
                    }

                    defer { group.leave() }

                    if let error = error {
                        stateQueue.sync {
                            if firstError == nil { firstError = error }
                        }
                        return
                    }

                    do {
                        if let url = item as? URL {
                            try self.copyToGroupContainer(
                                sourceURL: url,
                                fallbackFilename: url.lastPathComponent,
                                mimeType: matchedType.preferredMIMEType ?? "application/octet-stream"
                            )
                            stateQueue.sync { processedCount += 1 }
                        } else if let data = item as? Data {
                            let tempURL = FileManager.default.temporaryDirectory
                                .appendingPathComponent(UUID().uuidString)
                                .appendingPathExtension(matchedType.preferredFilenameExtension ?? "bin")
                            try data.write(to: tempURL, options: .atomic)

                            try self.copyToGroupContainer(
                                sourceURL: tempURL,
                                fallbackFilename: "shared.\(matchedType.preferredFilenameExtension ?? "bin")",
                                mimeType: matchedType.preferredMIMEType ?? "application/octet-stream"
                            )
                            try? FileManager.default.removeItem(at: tempURL)

                            stateQueue.sync { processedCount += 1 }
                        } else if let image = item as? UIImage,
                                  let jpegData = image.jpegData(compressionQuality: 0.92) {
                            let tempURL = FileManager.default.temporaryDirectory
                                .appendingPathComponent(UUID().uuidString)
                                .appendingPathExtension("jpg")
                            try jpegData.write(to: tempURL, options: .atomic)

                            try self.copyToGroupContainer(
                                sourceURL: tempURL,
                                fallbackFilename: "shared.jpg",
                                mimeType: "image/jpeg"
                            )
                            try? FileManager.default.removeItem(at: tempURL)

                            stateQueue.sync { processedCount += 1 }
                        } else {
                            stateQueue.sync {
                                if firstError == nil { firstError = ShareError.invalidSharedItem }
                            }
                        }
                    } catch {
                        stateQueue.sync {
                            if firstError == nil { firstError = error }
                        }
                    }
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }

            if processedCount > 0 {
                self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            } else {
                self.cancelWithError(firstError?.localizedDescription ?? "Impossible d'importer ce fichier.")
            }
        }
    }

    private func copyToGroupContainer(
        sourceURL: URL,
        fallbackFilename: String,
        mimeType: String
    ) throws {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupID
        ) else {
            NSLog("[TidyShare] ⛔ containerURL nil pour App Group: \(appGroupID)")
            throw ShareError.groupContainerUnavailable
        }

        NSLog("[TidyShare] App Group container: \(containerURL.path)")

        let inboxURL = containerURL.appendingPathComponent(stagingFolder, isDirectory: true)

        try FileManager.default.createDirectory(
            at: inboxURL,
            withIntermediateDirectories: true,
            attributes: nil
        )

        let fileID = UUID().uuidString.lowercased()

        let originalExtension: String = {
            if !sourceURL.pathExtension.isEmpty {
                return sourceURL.pathExtension.lowercased()
            }
            let ext = (fallbackFilename as NSString).pathExtension.lowercased()
            return ext.isEmpty ? inferredExtension(for: mimeType) : ext
        }()

        let originalFilename: String = {
            let candidate = sourceURL.lastPathComponent
            if !candidate.isEmpty { return candidate }
            return fallbackFilename.isEmpty ? "shared.\(originalExtension)" : fallbackFilename
        }()

        let binaryFilename = "\(fileID).\(originalExtension)"
        let destURL = inboxURL.appendingPathComponent(binaryFilename)
        let manifestURL = inboxURL.appendingPathComponent("\(fileID).manifest.json")

        let needsScope = sourceURL.startAccessingSecurityScopedResource()
        defer {
            if needsScope {
                sourceURL.stopAccessingSecurityScopedResource()
            }
        }

        if FileManager.default.fileExists(atPath: destURL.path) {
            try FileManager.default.removeItem(at: destURL)
        }

        if FileManager.default.fileExists(atPath: manifestURL.path) {
            try FileManager.default.removeItem(at: manifestURL)
        }

        let tmpCopyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(originalExtension)

        if FileManager.default.fileExists(atPath: tmpCopyURL.path) {
            try FileManager.default.removeItem(at: tmpCopyURL)
        }

        try FileManager.default.copyItem(at: sourceURL, to: tmpCopyURL)
        defer { try? FileManager.default.removeItem(at: tmpCopyURL) }

        try FileManager.default.copyItem(at: tmpCopyURL, to: destURL)

        let attributes = try FileManager.default.attributesOfItem(atPath: destURL.path)
        let fileSize = (attributes[.size] as? NSNumber)?.intValue ?? 0

        guard fileSize > 0 else {
            try? FileManager.default.removeItem(at: destURL)
            throw ShareError.invalidSharedItem
        }

        guard fileSize <= maxFileSizeBytes else {
            try? FileManager.default.removeItem(at: destURL)
            throw ShareError.fileTooLarge
        }

        let suggestedTitle: String = {
            let typedText = contentText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !typedText.isEmpty { return typedText }
            return (originalFilename as NSString).deletingPathExtension
        }()

        let manifest: [String: Any] = [
            "id": fileID,
            "filename": originalFilename,
            "mimeType": mimeType,
            "title": suggestedTitle,
            "fileSizeBytes": fileSize,
            "sharedAt": ISO8601DateFormatter().string(from: Date()),
            "binaryFilename": binaryFilename,
        ]

        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [])
        try manifestData.write(to: manifestURL, options: .atomic)

        NSLog("[TidyShare] ✓ Fichier écrit : \(binaryFilename), manifest : \(fileID).manifest.json")
    }

    private func inferredExtension(for mimeType: String) -> String {
        switch mimeType {
        case "application/pdf":
            return "pdf"
        case "image/png":
            return "png"
        case "image/jpeg":
            return "jpg"
        default:
            return "bin"
        }
    }

    private func cancelWithError(_ message: String) {
        let error = NSError(
            domain: "TidyShareExtension",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
        extensionContext?.cancelRequest(withError: error)
    }

    enum ShareError: LocalizedError {
        case groupContainerUnavailable
        case invalidSharedItem
        case fileTooLarge

        var errorDescription: String? {
            switch self {
            case .groupContainerUnavailable:
                return "Le conteneur partagé est indisponible."
            case .invalidSharedItem:
                return "Le contenu partagé n'est pas valide."
            case .fileTooLarge:
                return "Le fichier dépasse la taille maximale autorisée de 50 Mo."
            }
        }
    }
}
