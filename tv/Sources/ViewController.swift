import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var motionBridge: MotionBridge!

    private let ipKey = "tv.ip"
    private var tvIP: String {
        get { UserDefaults.standard.string(forKey: ipKey) ?? "192.168.1.115" }
        set { UserDefaults.standard.set(newValue, forKey: ipKey) }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupWebView()
        motionBridge = MotionBridge(webView: webView)

        let twoFingerTap = UITapGestureRecognizer(target: self, action: #selector(editIP))
        twoFingerTap.numberOfTouchesRequired = 2
        twoFingerTap.numberOfTapsRequired = 2
        view.addGestureRecognizer(twoFingerTap)

        loadTV()
    }

    deinit {
        motionBridge?.stop()
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "tvNative")
        config.userContentController.addUserScript(makeBridgeScript())

        webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func makeBridgeScript() -> WKUserScript {
        let js = """
        (function() {
          try {
            Object.defineProperty(window, 'isSecureContext', {
              configurable: true,
              get: function() { return true; }
            });
          } catch (e) {}

          function rewriteKartUrl(u) {
            if (typeof u !== 'string') return u;
            return u.replace(/^https:\\/\\/([^\\/:]+):8485(\\/.*)?$/, 'http://$1:8484$2')
                    .replace(/^https:\\/\\/([^\\/:]+):5443(\\/.*)?$/, 'http://$1:5400$2');
          }

          // Rewrite iframe src="https://...:8485/controller" -> "http://...:8484/controller"
          var desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
          if (desc && desc.set) {
            Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
              configurable: true,
              get: desc.get,
              set: function(v) { return desc.set.call(this, rewriteKartUrl(v)); }
            });
          }

          if (typeof DeviceOrientationEvent !== 'undefined') {
            DeviceOrientationEvent.requestPermission = function() {
              try { window.webkit.messageHandlers.tvNative.postMessage({ cmd: 'startMotion' }); } catch (e) {}
              return Promise.resolve('granted');
            };
          }
          if (typeof DeviceMotionEvent !== 'undefined') {
            DeviceMotionEvent.requestPermission = function() {
              try { window.webkit.messageHandlers.tvNative.postMessage({ cmd: 'startMotion' }); } catch (e) {}
              return Promise.resolve('granted');
            };
          }

          function fireMotion(a, b, g, ax, ay, az, rx, ry, rz) {
            var oe = new Event('deviceorientation');
            oe.alpha = a; oe.beta = b; oe.gamma = g; oe.absolute = false;
            window.dispatchEvent(oe);

            var me = new Event('devicemotion');
            me.acceleration = { x: ax, y: ay, z: az };
            me.accelerationIncludingGravity = { x: ax, y: ay, z: az };
            me.rotationRate = { alpha: rz, beta: rx, gamma: ry };
            me.interval = 16.6;
            window.dispatchEvent(me);
          }

          window.__nativeMotion = function(a, b, g, ax, ay, az, rx, ry, rz) {
            fireMotion(a, b, g, ax, ay, az, rx, ry, rz);
            var frames = document.querySelectorAll('iframe');
            for (var i = 0; i < frames.length; i++) {
              try {
                frames[i].contentWindow.postMessage({
                  type: '__nativeMotion',
                  args: [a, b, g, ax, ay, az, rx, ry, rz]
                }, '*');
              } catch (e) {}
            }
          };

          window.addEventListener('message', function(ev) {
            if (ev.data && ev.data.type === '__nativeMotion' && Array.isArray(ev.data.args)) {
              fireMotion.apply(null, ev.data.args);
            }
          });
        })();
        """
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    }

    private func loadTV() {
        guard let url = URL(string: "http://\(tvIP):5400/") else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOfflineError(error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOfflineError(error.localizedDescription)
    }

    private func showOfflineError(_ detail: String) {
        let alert = UIAlertController(
            title: "Can't reach TV (\(tvIP))",
            message: "\(detail)\n\nMake sure CouchTV is running on your TV and your iPhone is on the same Wi-Fi.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { _ in self.loadTV() })
        alert.addAction(UIAlertAction(title: "Change IP", style: .default) { _ in self.editIP() })
        present(alert, animated: true)
    }

    @objc private func editIP() {
        let alert = UIAlertController(title: "TV IP Address", message: "Enter your Google TV / Android TV local IP", preferredStyle: .alert)
        alert.addTextField { tf in
            tf.text = self.tvIP
            tf.keyboardType = .decimalPad
        }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
        alert.addAction(UIAlertAction(title: "Save", style: .default) { _ in
            let val = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !val.isEmpty else { return }
            self.tvIP = val
            self.loadTV()
        })
        present(alert, animated: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        if cmd == "startMotion" {
            motionBridge.start()
        }
    }
}
