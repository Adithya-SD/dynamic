"""Rebuild shared/presets.json (v3): fewer presets, each a different relation between pattern, fluid and particles.
Behaviours (beh): 0 Glow, 1 Swarm, 2 Ink, 3 Vortex, 4 Obstacle, 5 Magnet. Palettes: 0 Hue 1 Spectrum 2 Sunset
3 Ocean 4 Aurora 5 Ember 6 Clay 7 Gold 8 Ice 9 Neon."""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from jsonfmt import dump

d = json.load(open(ROOT / 'shared/presets.json', encoding='utf-8'))
old = {x['n']: x for x in d['presets']}
classic = [x for x in d['presets'] if x['c'] == 'Classic']

def P(n, c, i, about, **kw): return {'n': n, 'c': c, 'i': i, 'about': about, 'p': kw}
new = [
    P('Flower of Life', 'Sacred', 'mandala', 'Sixty thousand sparks find the nineteen circles and settle on them. Every beat blows the flower apart; it gathers itself again.',
      geo='Flower of Life', beh=1, pal=4, h=.42, hr=.6, field=5, fs=.15, gsz=1.0, grot=.05, gcnt=-.07),
    P('Sri Yantra', 'Sacred', 'prism', 'The fluid runs along all nine triangles at once: rivers of fire circling the bindu.',
      geo='Sri Yantra', beh=3, pal=5, h=.97, hr=.35, gsz=.98, grot=.03),
    P('Metatron', 'Sacred', 'torus', 'Particles orbit every line of the cube like filings round a magnet, tracing the solids hidden inside.',
      geo="Metatron's Cube", beh=5, pal=7, h=.08, hr=.45, gsz=.98, grot=.04, gcnt=-.06),
    P('Torus', 'Sacred', 'torus', 'Flow follows the thirty-six circles of the torus: an endless loop through the centre and around.',
      geo='Torus', beh=3, pal=3, h=.5, hr=.5, gsz=.95, grot=.1, gcnt=-.1),
    P('Yin Yang', 'Sacred', 'infinity', 'A slow current circles the symbol and parts around it, light and dark ink wrapping each other.',
      geo='Yin Yang', beh=4, pal=0, h=.55, hr=.5, gsz=.92, grot=.12, gcnt=.12),
    P('Seed of Life', 'Sacred', 'phi', 'Seven circles bleed watercolour into a twelve-fold mirror that falls into itself.',
      geo='Seed of Life', beh=2, space=1, kal=12, foldDepth=2, pal=8, h=.55, hr=.4, echo=.45, ezoom=.25, gsz=.95, grot=.06, gcnt=-.1),
    P('Chakra Journey', 'Chakra', 'torus', 'Root to crown: each chakra assembled by the swarm in its own colour, rising one centre at every drop (or every 8 bars).',
      geo='Muladhara', beh=1, pal=0, h=0, hr=.14, field=5, fs=.12, gsz=.95, grot=.05, gcnt=-.08, gcm=2),
    P('Kundalini', 'Chakra', 'spiral', 'Rainbow fluid climbs the spine along both serpents, through all seven centres.',
      geo='Seven Chakras', beh=3, pal=1, h=.0, hr=.85, gsz=1.0),
    P('Ganesha', 'Divine', 'user', 'Ganesha painted in bleeding ink: crown, ears and curling trunk dissolving and re-forming with the music.',
      geo='Ganesha', beh=2, pal=5, h=.04, hr=.3, field=5, fs=.12, gsz=.98),
    P('Om', 'Divine', 'phi', 'The first sound, spelled by a swarm of light that scatters on the beat and gathers again.',
      geo='Om', beh=1, pal=7, h=.07, hr=.35, gsz=.95),
    P('Shiva', 'Divine', 'prism', 'A slow current pours around the trident and its ring of flames.',
      geo='Trishul', beh=4, pal=8, h=.58, hr=.4, gsz=.95),
    P('Dharma Wheel', 'Divine', 'mandala', 'Eight spokes stir the fluid into an eight-fold turning river.',
      geo='Dharma Wheel', beh=3, space=1, kal=8, pal=7, h=.1, hr=.3, gsz=.95, grot=.15),
    P('Cymatics', 'Math', 'mandala', 'Sand on a vibrating plate: the swarm collects on the nodal lines, and each drop strikes a new mode.',
      geo='Chladni', beh=1, pal=3, h=.48, hr=.5, gsz=1.15),
    P('Lorenz', 'Math', 'infinity', 'Particles race around the butterfly attractor: chaos that never repeats and never escapes.',
      geo='Lorenz', beh=5, pal=5, h=.98, hr=.4, gsz=1.0),
    P('Tesseract', 'Math', 'prism', 'A four-dimensional cube turning through ours, its edges glowing down an echo tunnel.',
      geo='Tesseract', beh=0, pal=8, h=.55, hr=.5, echo=.55, ezoom=.3, gsz=1.0, grot=.05),
    P('Mandelbrot', 'Math', 'spiral', 'A current swirls around the edge of the Mandelbrot set and shreds into its bays.',
      geo='Mandelbrot', beh=4, pal=1, h=.55, hr=.7, gsz=1.05),
    P('Penrose', 'Math', 'prism', 'An aperiodic tiling assembled by the swarm: five-fold order that never repeats.',
      geo='Penrose', beh=1, pal=2, h=.9, hr=.5, gsz=1.1, grot=.02),
    P('Platonic', 'Math', 'prism', 'All five Platonic solids nested and turning, particles orbiting their edges.',
      geo='Platonic Nest', beh=5, pal=4, h=.3, hr=.7, gsz=1.0),
    P('Hypnotic', 'Psychedelic', 'spiral', 'The fluid pours along six spiral arms into an infinite echo tunnel.',
      geo='Hypno Spiral', beh=3, pal=9, h=.75, hr=.8, echo=.6, ezoom=.35, etwist=.15, gsz=1.15, grot=.25),
    P('Hyperbolic Hive', 'Psychedelic', 'prism', 'A honeycomb bleeding ink in the hyperbolic plane: seven hexagons where six should fit.',
      geo='Honeycomb', beh=2, space=3, hp=7, hq=3, drift=.2, pal=9, h=.5, hr=.6, gsz=.8),
    P('Op Art', 'Psychedelic', 'mandala', 'A logarithmic checkerboard the fluid has to flow around, folded eight ways.',
      geo='Radial Checker', beh=4, space=1, kal=8, pal=9, h=.85, hr=.5, gsz=1.3, grot=.1),
]
keep = {'Nebula': 'Cosmos', 'Aurora': 'Cosmos', 'Ocean': 'Fluid', 'Acid': 'Psychedelic'}
fluid = []
for n, c in keep.items():
    x = dict(old[n]); x['c'] = c; fluid.append(x)
d['presets'] = new + fluid + classic
d['categories'] = ['Sacred', 'Chakra', 'Divine', 'Math', 'Psychedelic', 'Cosmos', 'Fluid', 'Classic']
dump(d, ROOT / 'shared/presets.json')
print(len(new), 'geometry presets,', len(fluid), 'fluid,', len(classic), 'classic')
