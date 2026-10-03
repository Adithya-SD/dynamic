# Progress

## Done
- **Unified engine.** `shared/` (shaders, params, presets) + `web/` build one app (`docs/index.html`); Android bundles it.
- **Spaces:** plain, kaleidoscope, prism, hyperbolic {p,q}, golden spiral, two-pole spiral. The kaleidoscope edge-black bug is gone by construction (mirror-wrapped sampling).
- **Fields:** torus, vortex, golden spiral, poles, breath. **Echo** feedback, **bloom**, grain, lens fringe, thin-film iridescence.
- **Particles:** 32-bit float state (the phone's frozen/jerky particles came from half-float rounding), velocity-stretched streaks.
- **Startup:** one small shader per space, parallel compile, loading screen. First frame 0.6 s (Intel iGPU) / 1.8 s (RTX 3050), was 8-40 s.
- **Speed:** 126 fps at 1896x988, simulation 491x256, full-resolution ink, on the RTX 3050 (100 MiB of GPU memory).
- **Interface:** settings search, 7 tabs, tap-to-arm sliders (a slider ignores touch until tapped once, so scrolling never changes values), FPS on by default, liquid glass everywhere, UI dissolves into the fluid in auto modes and wakes on tap.
- **Presets:** 20 curated + 27 Classic; exposure calibrated per preset by `H.calibrate`.
- **Music:** 375 analysis updates/s; phone audio capture, microphone, files, streams; Spotify via media session on Android, PKCE login on web.
- **Logo:** `tools/make_logo.py` (12-fold kaleidoscope, golden rings).
- **Android:** builds (3.3 MB APK). Not yet run on a phone.

## Next
1. Install on the phone (`powershell -File tools/build_android.ps1 -Install`) and verify: WebView frame rate, phone-audio capture, Spotify controls, haptics, gallery saving, share sheet.
2. Publish: GitHub repo `dynamic` (public) + Pages from `/docs`.
3. More presets on the themes: nature of reality, photographic composition (rule of thirds / golden-point framing), Claude-trailer warmth.
4. Spotify: seek slider and album-colour mode on Android; Android App Links for preset URLs once the Pages URL exists.
5. Live-audio latency measurement (audio to screen) on a real phone.

## Notes
- Old native C++/Compose engine and Codex's PC build live on the local branch `archive/native-codex`.
- Shell scripts and Python run on Windows with CRLF checkouts; `.gitattributes` normalises to LF.
