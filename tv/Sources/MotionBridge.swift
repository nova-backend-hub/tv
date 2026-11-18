import CoreMotion
import Foundation
import WebKit

final class MotionBridge {
    private let manager = CMMotionManager()
    private weak var webView: WKWebView?
    private var active = false

    init(webView: WKWebView) {
        self.webView = webView
    }

    func start() {
        guard !active, manager.isDeviceMotionAvailable else { return }
        active = true
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, _ in
            guard let self = self, self.active, let dm = data else { return }
            let rad2deg = 180.0 / Double.pi
            let alpha = dm.attitude.yaw * rad2deg
            let beta = dm.attitude.pitch * rad2deg
            let gamma = dm.attitude.roll * rad2deg
            let ax = dm.userAcceleration.x * 9.81
            let ay = dm.userAcceleration.y * 9.81
            let az = dm.userAcceleration.z * 9.81
            let rx = dm.rotationRate.x * rad2deg
            let ry = dm.rotationRate.y * rad2deg
            let rz = dm.rotationRate.z * rad2deg
            let js = String(
                format: "window.__nativeMotion && window.__nativeMotion(%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f);",
                alpha, beta, gamma, ax, ay, az, rx, ry, rz
            )
            self.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func stop() {
        guard active else { return }
        active = false
        manager.stopDeviceMotionUpdates()
    }
}
