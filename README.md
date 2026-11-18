# tv

iOS app (`tv.ipa`) packaging the **CouchTV Remote** menu and **OpenWii Mario Kart** controller + game so it connects to your Android/Google TV over plain local HTTP/WebSocket without HTTPS certificates or Safari motion-permission prompts.

## Features
- **Menu**: Bundled CouchTV Remote UI talking directly to `http://<tv-ip>:5400`.
- **Kart Remote**: Bundled Wii Remote controller talking to `ws://<tv-ip>:8484/ws` with native 60 Hz `CoreMotion` (`CMMotionManager`) tilt steering.
- **Kart Game**: Bundled Mario Kart web game.
- **Zero-HTTPS**: Uses `NSAllowsLocalNetworking` + `NSAllowsArbitraryLoads` in `Info.plist` and serves bundled assets from `http://127.0.0.1:18080`.

## Building `tv.ipa`
GitHub Actions automatically builds `tv.ipa` on every push to `main` via `.github/workflows/build-ipa.yml`:
1. Open the **Actions** tab on GitHub and select the latest **Build tv.ipa** run.
2. Download the **tv-ipa** artifact (`tv.ipa`).
3. Sideload `tv.ipa` onto your iPhone using **Sideloadly** or **AltServer** with your Apple ID.
4. Tap the IP button in the top-right corner of the app if your TV's IP changes from `192.168.1.115`.

