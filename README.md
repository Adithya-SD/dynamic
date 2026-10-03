# Dynamic

A GPU fluid simulation where math, music and touch become living light. Draw, and the ink folds through
kaleidoscopes, hyperbolic tilings and golden spirals. Play music and every frequency draws its own ring.

**One engine, two apps.** The web app is the engine. The Android app is a native shell around the same code, so the
phone and the PC look and behave identically.

## Use it
- **Web / PC:** open `docs/index.html` (or the hosted page). For microphone and the file picker, serve it:
  `python tools/dev_server.py` then open <http://127.0.0.1:8765/docs/index.html>.
- **Android:** `python tools/build_web.py`, then `powershell -File tools/build_android.ps1 -Install` with the phone attached.

## What is where
| Path | What |
|---|---|
| `shared/shaders/` | GLSL ES 3.00: fluid solver, brush stamps, particles, spaces, material, bloom, echo, liquid glass |
| `shared/params.json` | every setting: tab, group, range, default. The UI is generated from it |
| `shared/presets.json` | 20 curated presets plus the 27 Classic originals |
| `web/` | shell (`index.html`) and modules (`src/*.js`, concatenated in name order) |
| `docs/` | the built app (`index.html`, icons, manifest): what GitHub Pages serves and what Android bundles |
| `app/` | Android shell: WebView, phone-audio capture, Spotify session, haptics, gallery saving |
| `tools/` | `build_web.py`, `build_android.ps1`, `make_logo.py`, headless test runner (`shoot.mjs`, `harness.js`) |
| `reference/` | the original `dynamics-8.html` this started from |

## Spaces
Each setting of **Space** changes how the screen is mapped onto the fluid. Brush strokes use the same map,
so ink lands exactly under your finger.
Plain · Kaleido (mirror folds) · Prism (three-mirror kaleidoscope) · Hyperbolic {p,q} (Escher's circle limit) ·
Spiral (log-spiral, 6.854 growth per turn is φ⁴, the golden spiral) · Two poles (Möbius spiral between golden points).

## Music
Phone audio (Android), microphone, any file, or a stream URL. 24 log-spaced bands, 375 analysis updates a second.
Low notes draw near the centre and high notes near the edge; loudness sets speed and force; each band detects its own
onsets, so there is no fixed tempo to lock to. Spotify supplies track info, artwork and controls (it does not share audio).

## Develop
```
python tools/build_web.py                                  # rebuild docs/index.html
python tools/dev_server.py 8765                            # serve + receive test snapshots
node tools/shoot.mjs "return await H.sheet(H.curated(),{name:'all'})"   # contact sheet into .shots/
node tools/shoot.mjs "return await H.calibrate(H.curated())"            # exposure per preset
```
`tools/shoot.mjs` drives headless Edge with real GPU rendering (`GPU=low` for the integrated GPU).
