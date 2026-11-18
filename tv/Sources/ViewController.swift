import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var server: LocalAssetServer?
    private var webView: WKWebView!
    private var motionBridge: MotionBridge!

    private let ipKey = "tv.ip"
    private var tvIP: String {
        get { UserDefaults.standard.string(forKey: ipKey) ?? "192.168.1.115" }
        set { UserDefaults.standard.set(newValue, forKey: ipKey) }
    }

    private let segment = UISegmentedControl(items: ["Menu", "Kart Remote", "Kart Game"])
    private let ipButton = UIButton(type: .system)

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        server = LocalAssetServer(port: 18080)
        server?.start()

        setupTopBar()
        setupWebView()
        motionBridge = MotionBridge(webView: webView)
        loadMode(index: 0)
    }

    deinit {
        motionBridge?.stop()
        server?.stop()
    }

    private func setupTopBar() {
        let bar = UIView()
        bar.backgroundColor = UIColor(white: 0.08, alpha: 0.96)
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        segment.selectedSegmentIndex = 0
        segment.backgroundColor = UIColor(white: 0.16, alpha: 1)
        segment.selectedSegmentTintColor = UIColor(red: 0.16, green: 0.48, blue: 1.0, alpha: 1)
        segment.setTitleTextAttributes([.foregroundColor: UIColor.lightGray, .font: UIFont.systemFont(ofSize: 12, weight: .semibold)], for: .normal)
        segment.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 12, weight: .bold)], for: .selected)
        segment.addTarget(self, action: #selector(segmentChanged), for: .valueChanged)
        segment.translatesAutoresizingMaskIntoConstraints = false

        ipButton.setTitle(tvIP, for: .normal)
        ipButton.setTitleColor(.white, for: .normal)
        ipButton.titleLabel?.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        ipButton.backgroundColor = UIColor(white: 0.18, alpha: 1)
        ipButton.layer.cornerRadius = 8
        ipButton.contentEdgeInsets = UIEdgeInsets(top: 5, left: 8, bottom: 5, right: 8)
        ipButton.addTarget(self, action: #selector(editIP), for: .touchUpInside)
        ipButton.translatesAutoresizingMaskIntoConstraints = false

        bar.addSubview(segment)
        bar.addSubview(ipButton)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 42),

            segment.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 10),
            segment.centerYAnchor.constraint(equalTo: bar.centerYAnchor),

            ipButton.leadingAnchor.constraint(greaterThanOrEqualTo: segment.trailingAnchor, constant: 8),
            ipButton.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -10),
            ipButton.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
        ])
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
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 42),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func makeBridgeScript() -> WKUserScript {
        let ip = tvIP
        let js = """
        (function() {
          window.__TV_IP__ = \(jsonString(ip));
          try { localStorage.setItem('tv.ip', window.__TV_IP__); } catch (e) {}

          var base5400 = 'http://' + window.__TV_IP__ + ':5400';
          function rewriteUrl(u) {
            if (typeof u !== 'string') return u;
            if (/^\\/(api|events|art|img|tv)(\\/|\\?|$)/.test(u)) {
              return base5400 + u;
            }
            if (/^https:\\/\\/[^\\/]+:(8485|5443)\\/controller/.test(u)) {
              return 'http://127.0.0.1:18080/kart/controller.html';
            }
            return u;
          }

          var origFetch = window.fetch;
          if (origFetch) {
            window.fetch = function(input, init) {
              if (typeof input === 'string') input = rewriteUrl(input);
              else if (input && typeof input.url === 'string') {
                var nu = rewriteUrl(input.url);
                if (nu !== input.url) input = new Request(nu, input);
              }
              return origFetch.call(this, input, init);
            };
          }

          var OrigES = window.EventSource;
          if (OrigES) {
            window.EventSource = function(url, cfg) {
              return new OrigES(rewriteUrl(url), cfg);
            };
            window.EventSource.prototype = OrigES.prototype;
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

          window.__nativeMotion = function(a, b, g, ax, ay, az, rx, ry, rz) {
            var oe = new Event('deviceorientation');
            oe.alpha = a; oe.beta = b; oe.gamma = g; oe.absolute = false;
            window.dispatchEvent(oe);

            var me = new Event('devicemotion');
            me.acceleration = { x: ax, y: ay, z: az };
            me.accelerationIncludingGravity = { x: ax, y: ay, z: az };
            me.rotationRate = { alpha: rz, beta: rx, gamma: ry };
            me.interval = 16.6;
            window.dispatchEvent(me);
          };
        })();
        """
        return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    }

    private func jsonString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s], options: [])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"192.168.1.115\"]"
        return String(arr.dropFirst().dropLast())
    }

    @objc private func segmentChanged() {
        loadMode(index: segment.selectedSegmentIndex)
    }

    private func loadMode(index: Int) {
        let path: String
        switch index {
        case 1:
            path = "http://127.0.0.1:18080/kart/controller.html"
            motionBridge.start()
        case 2:
            path = "http://127.0.0.1:18080/kart/games/mario-kart/index.html"
            motionBridge.stop()
        default:
            path = "http://127.0.0.1:18080/"
            motionBridge.stop()
        }
        if let url = URL(string: path) {
            webView.load(URLRequest(url: url))
        }
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
            self.ipButton.setTitle(val, for: .normal)
            self.webView.configuration.userContentController.removeAllUserScripts()
            self.webView.configuration.userContentController.addUserScript(self.makeBridgeScript())
            self.loadMode(index: self.segment.selectedSegmentIndex)
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
