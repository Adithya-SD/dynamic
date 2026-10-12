"""Adds the Fractal (zooming) and Physics / string-theory presets and a few effect presets to shared/presets.json.
Run once: python tools/presets_v4.py   (idempotent: presets are replaced by name)."""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import jsonfmt
ROOT = pathlib.Path(__file__).resolve().parent.parent
f = ROOT / 'shared' / 'presets.json'
D = json.load(open(f, encoding='utf-8'))

FR = {"rel": 0, "met": 0, "irs": 0, "fre": 0, "grain": 0.05, "bloom": 0.6, "bth": 0.45, "vig": 0.3, "s": 0.95, "glw": 1.0, "ctr": 1.05,
      "den": 1.0, "vel": 0.12, "curl": 12, "amt": 0.4, "ts": 0.7, "tone": 1, "vib": 1.3, "blk": 0.03, "rad": 0.1, "ink": 0.35, "aglow": 0.7}
PH = {"rel": 0, "met": 0, "irs": 0, "fre": 0, "grain": 0.05, "bloom": 0.55, "bth": 0.5, "vig": 0.35, "s": 0.9, "glw": 1.1, "ctr": 1.05, "den": 0.7,
      "vel": 0.1, "curl": 20, "amt": 1.1, "ts": 0.6, "tone": 1, "vib": 1.4, "blk": 0.04, "rad": 0.11, "ink": 0.35}

def fr(n, icon, about, site, pal, h, hr, **kw):
    p = dict(FR, ff=site, pal=pal, h=h, hr=hr); p.update(kw)
    return {"n": n, "c": "Fractal", "i": icon, "about": about, "p": p}
def ph(n, icon, about, geo, beh, pal, h, hr, **kw):
    p = dict(PH, geo=geo, beh=beh, pal=pal, h=h, hr=hr, gsz=0.95); p.update(kw)
    return {"n": n, "c": "Physics", "i": icon, "about": about, "p": p}

NEW = [
 fr("Mandelbrot", "spiral", "Zoom into the Mandelbrot set for ever: the picture dives to a spiral and then repeats exactly, so there is no bottom. Every beat punches the zoom in. Scroll the wheel to zoom by hand.", 1, 4, 0.55, 0.6, fsp=0.4, fbt=0.9),
 fr("Seahorse Valley", "swirl", "A dive into the seahorse tails of the Mandelbrot set. It never ends and it moves with the music.", 3, 2, 0.02, 0.7, fsp=0.35, fbt=0.9),
 fr("Valley of Lightning", "comet", "Forked filaments of the Mandelbrot set, crackling brighter on every beat.", 2, 9, 0.75, 0.5, fsp=0.45, fbt=1.1),
 fr("Twisted Mandelbrot", "swirl", "The set turns as you fall into it: each loop of the zoom is also a quarter turn.", 4, 1, 0.0, 1.0, fsp=0.38, fbt=0.8),
 fr("Tendril Garden", "leaf", "Fine tendrils and tiny copies of the whole set, in ice and glass.", 5, 8, 0.55, 0.45, fsp=0.4, fbt=0.9),
 fr("Julia Dendrite", "veins", "A Julia set with no inside, only branches, and a zoom that loops for ever.", 6, 7, 0.1, 0.4, fsp=0.45, fbt=1.0),
 fr("Douady Rabbit", "drop", "The rabbit: a Julia set of three fat lobes, flying into one of its pinch points.", 7, 4, 0.5, 0.55, fsp=0.4, fbt=0.9),
 fr("Julia Spirals", "spiral", "Spiral arms of a Julia set. The zoom turns with them and never stops.", 8, 0, 0.8, 1.0, fsp=0.4, fbt=0.9),
 fr("Burning Ship", "star", "The Burning Ship fractal: masts, rigging and a fleet of tiny ships at every scale. The zoom fades from one scale to the next.", 9, 5, 0.03, 0.5, fsp=0.3, fbt=0.7),
 fr("Cathedral Ship", "diamond", "A taller view of the Burning Ship: pillars and arches of light that you fall between.", 12, 8, 0.58, 0.4, fsp=0.3, fbt=0.7),
 fr("Tricorn", "hex", "The Tricorn: a Mandelbrot set that is mirrored on itself, in cold crystal.", 10, 3, 0.55, 0.5, fsp=0.3, fbt=0.7),
 fr("Multibrot", "ring", "Cubic Mandelbrot: three-fold petals and bays, endlessly.", 11, 9, 0.7, 0.6, fsp=0.3, fbt=0.7),
 fr("Mandala Zoom", "flower", "The Mandelbrot dive seen through a six-way kaleidoscope: a mandala that never stops opening.", 1, 1, 0.0, 1.0, space=1, kal=6, foldDepth=1, fsp=0.35, fbt=0.9, fam=0.9),
 fr("Mandelbrot Orb", "orb", "A Julia dive wrapped round a ball, with the endless picture out of focus behind it.", 6, 4, 0.5, 0.6, orb=0.72, odepth=0.7, fsp=0.35, fbt=0.8, fam=0.9),
 fr("Fractal Tunnel", "tunnel", "A twisted dive reflected down an echo tunnel.", 4, 9, 0.8, 0.7, echo=0.55, ezoom=0.25, fsp=0.3, fbt=0.8),

 ph("Superstrings", "wave", "Closed strings vibrating in several modes at once, as in string theory: every note is a different shape of loop.", "Superstring", 0, 9, 0.7, 0.5),
 ph("Calabi-Yau", "hex", "A cross-section of a Calabi-Yau manifold, the folded six-dimensional space that string theory hides inside every point. Flow runs along its patches.", "Calabi-Yau", 0, 4, 0.5, 0.5, curl=16),
 ph("Hopf Fibration", "ring", "Linked circles that fill a four-dimensional sphere: every circle touches every other, like filings round a magnet.", "Hopf Fibration", 0, 3, 0.5, 0.5),
 ph("E8", "star", "The 240 roots of E8, the symmetry of the heterotic string: eight rings of thirty that slowly turn into another view of themselves. A swarm of light draws it.", "E8 Lattice", 1, 7, 0.1, 0.35),
 ph("Brane World", "wave", "A membrane rippling through a higher dimension, with a travelling bump: our universe as a sheet.", "Brane", 0, 8, 0.55, 0.45),
 ph("Wormhole", "tunnel", "The throat of a wormhole in perspective, with the picture falling through the echo tunnel.", "Wormhole", 3, 1, 0.0, 1.0, echo=0.45, ezoom=0.3),
 ph("Thomas Attractor", "swirl", "A strange attractor with cubic symmetry: a swarm that never repeats and never leaves.", "Thomas Attractor", 0, 5, 0.03, 0.5),
 ph("Vibrating Strings", "wave", "Lissajous strings: two vibrations in the ratio of small whole numbers, drawn as one loop.", "Lissajous Strings", 0, 2, 0.02, 0.7),
 ph("Klein Bottle", "ring", "A bottle with no inside: a surface that passes through itself, turning slowly.", "Klein Bottle", 0, 4, 0.5, 0.5),
 ph("Black Hole", "sun", "An accretion disc, the photon ring and the disc bent over the hole. Ink circles it and parts round the dark.", "Black Hole", 0, 5, 0.03, 0.4, bloom=0.8, gswirl=0.35, gsz=1.15),

 {"n": "Thermal Vision", "c": "Effects", "i": "flame", "about": "Everything seen through a thermal camera: cold blue, hot yellow-white.",
  "p": dict(PH, efx=5, efa=0.95, pal=3, h=0.55, hr=0.6, curl=24, amt=2.8, ink=0.55, den=0.45, rad=0.15, bloom=0.5, vib=1.0, tone=0)},
 {"n": "Glitch Tunnel", "c": "Effects", "i": "tunnel", "about": "An echo tunnel torn into sliding bands that jump harder on every beat.",
  "p": dict(PH, efx=2, efa=0.6, echo=0.55, ezoom=0.3, etwist=0.1, pal=9, h=0.8, hr=0.8, curl=30, amt=2.4, ink=0.5, den=0.5, rad=0.14, fx=3, pn=0.3)},
 {"n": "CRT Mandala", "c": "Effects", "i": "flower", "about": "A kaleidoscope on an old monitor: scanlines and a little glow.",
  "p": dict(PH, efx=1, efa=0.8, space=1, kal=8, foldDepth=2, pal=1, h=0.1, hr=1.0, curl=30, amt=1.3, bloom=0.7, grain=0.1)},
 {"n": "Halftone Pop", "c": "Effects", "i": "rainbow", "about": "Comic-book dots as big as the light: loud colour on the page.",
  "p": dict(PH, efx=4, efa=0.7, pal=9, h=0.0, hr=1.0, s=1.0, curl=28, amt=3.0, ink=0.55, den=0.5, rad=0.15, bloom=0.2, vib=1.5)},
 {"n": "Pixel Rain", "c": "Effects", "i": "rain", "about": "Falling light in fat pixels.",
  "p": dict(PH, efx=3, efa=0.45, wy=-14, fx=1, pn=0.6, pal=4, h=0.4, hr=0.5, curl=14, amt=1.0)},
 {"n": "Poster Sun", "c": "Effects", "i": "sun", "about": "Flat posterised colour: a screen-print of a slow fire.",
  "p": dict(PH, efx=6, efa=0.6, pal=2, h=0.02, hr=0.7, curl=18, amt=2.8, ink=0.55, den=0.45, rad=0.15, bloom=0.3, bu=14)},
 {"n": "Cosmic Web", "c": "Cosmos", "i": "sparkle", "about": "Look around: you stand still in the middle of an endless web of glowing filaments and dust. Turn the phone (or move the mouse) to look anywhere.",
  "p": {"cvs": 3, "auto": 0.45, "field": 5, "fs": 0.18, "fx": 3, "pn": 0.5, "psz": 1.4, "ptl": 0.94, "pbr": 1.7, "pal": 8, "h": 0.55, "hr": 0.7, "s": 0.9, "curl": 14, "ink": 0.6, "den": 0.3, "vel": 0.05, "amt": 1.7, "rad": 0.14, "bloom": 0.9, "glw": 1.3, "grain": 0.08, "vig": 0.35, "rel": 0}},
 {"n": "Quantum Foam", "c": "Physics", "i": "rain", "about": "Space at the smallest scale: bubbles that appear, tremble and vanish. Fine sparks, fast and small.",
  "p": dict(PH, fx=1, pn=0.7, psz=1.1, ptl=0.88, pbr=1.3, pspd=1.2, plf=1.2, curl=60, rad=0.06, ink=0.3, den=0.5, pal=9, h=0.6, hr=0.7, amt=0.8, cvs=3, auto=0.3)},
 {"n": "Event Horizon", "c": "Physics", "i": "orb", "about": "A ball of spiralling light on an endless spiral of backdrop: the point of no return.",
  "p": dict(PH, space=4, growth=3.5, orb=0.7, odepth=0.8, pal=5, h=0.03, hr=0.5, curl=26, auto=0.25, bloom=0.8, amt=1.2)},
 {"n": "Plasma Ball", "c": "Physics", "i": "lens", "about": "A glowing sphere whose ink streams along its surface and sparks fly off it.",
  "p": dict(PH, orb=0.6, odepth=0.6, fx=4, pn=0.4, psz=1.2, ptl=0.94, pal=9, h=0.75, hr=0.4, curl=30, amt=1.3, auto=0.2, bloom=0.8)},
]

cats = D['categories']
for c in ('Fractal', 'Physics', 'Effects'):
    if c not in cats:
        cats.insert(cats.index('Geometry') + 1 if c == 'Fractal' else cats.index('Fractal') + 1 if c == 'Physics' else cats.index('Physics') + 1, c)
names = {p['n'] for p in NEW}
D['presets'] = [p for p in D['presets'] if p['n'] not in names]
# new presets go after the Geometry block, before Chakra
idx = max(i for i, p in enumerate(D['presets']) if p['c'] == 'Geometry') + 1
D['presets'][idx:idx] = NEW
jsonfmt.dump(D, str(f))
print(len(NEW), 'presets added; categories', cats)
