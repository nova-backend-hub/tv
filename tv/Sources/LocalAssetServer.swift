import Foundation
import Network

final class LocalAssetServer {
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "dev.couchtv.localserver")
    private let wwwRoot: URL
    let port: UInt16

    init?(port: UInt16 = 18080) {
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("www") else { return nil }
        self.wwwRoot = root
        self.port = port
    }

    func start() {
        guard listener == nil, let nwPort = NWEndpoint.Port(rawValue: port) else { return }
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            let l = try NWListener(using: params, on: nwPort)
            l.newConnectionHandler = { [weak self] conn in
                self?.handle(conn)
            }
            l.start(queue: queue)
            listener = l
        } catch {
            NSLog("LocalAssetServer failed: \(error)")
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, _ in
            guard let self = self, let data = data, let req = String(data: data, encoding: .utf8) else {
                conn.cancel()
                return
            }
            let firstLine = req.components(separatedBy: "\r\n").first ?? ""
            let parts = firstLine.components(separatedBy: " ")
            let rawPath = parts.count > 1 ? parts[1] : "/"
            let cleanPath = rawPath.components(separatedBy: "?").first ?? "/"
            let response = self.buildResponse(for: cleanPath)
            conn.send(content: response, completion: .contentProcessed { _ in
                conn.cancel()
            })
        }
    }

    private func buildResponse(for path: String) -> Data {
        var rel = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if rel.isEmpty || rel == "menu" {
            rel = "index.html"
        } else if rel == "kart" {
            rel = "kart/controller.html"
        } else if rel == "kart/games/mario-kart" {
            rel = "kart/games/mario-kart/index.html"
        }

        let fileURL = wwwRoot.appendingPathComponent(rel).standardizedFileURL
        guard fileURL.path.hasPrefix(wwwRoot.standardizedFileURL.path) else {
            return httpResponse(status: "403 Forbidden", mime: "text/plain", body: Data("Forbidden".utf8))
        }

        var isDir: ObjCBool = false
        var targetURL = fileURL
        if FileManager.default.fileExists(atPath: targetURL.path, isDirectory: &isDir), isDir.boolValue {
            targetURL = targetURL.appendingPathComponent("index.html")
        }

        guard let body = try? Data(contentsOf: targetURL) else {
            return httpResponse(status: "404 Not Found", mime: "text/plain", body: Data("Not Found".utf8))
        }

        return httpResponse(status: "200 OK", mime: mimeType(for: targetURL.pathExtension), body: body)
    }

    private func httpResponse(status: String, mime: String, body: Data) -> Data {
        var header = "HTTP/1.1 \(status)\r\n"
        header += "Content-Type: \(mime)\r\n"
        header += "Content-Length: \(body.count)\r\n"
        header += "Access-Control-Allow-Origin: *\r\n"
        header += "Cache-Control: no-cache\r\n"
        header += "Connection: close\r\n\r\n"
        var out = Data(header.utf8)
        out.append(body)
        return out
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        default: return "application/octet-stream"
        }
    }
}
