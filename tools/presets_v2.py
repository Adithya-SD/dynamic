"""One-off: rebuild shared/presets.json around the geometry layer (v2). Kept for reference; edit presets.json directly now."""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from jsonfmt import dump

d = json.load(open(ROOT / 'shared/presets.json', encoding='utf-8'))
old = {x['n']: x for x in d['presets']}
classic = [x for x in d['presets'] if x['c'] == 'Classic']
if any(x.get('p', {}).get('geo') for x in d['presets']):
    sys.exit('presets.json is already v2')

def P(n, c, i, about, **kw): return {'n': n, 'c': c, 'i': i, 'about': about, 'p': kw}
# palettes: 0 Hue 1 Spectrum 2 Sunset 3 Ocean 4 Aurora 5 Ember 6 Clay 7 Gold 8 Ice 9 Neon
CH = [('Muladhara', 'Root. Four petals around the earth square: grounding red.', 0.0),
      ('Svadhisthana', 'Sacral. Six petals, the water crescent: flowing orange.', .065),
      ('Manipura', 'Solar plexus. Ten petals around the fire triangle: radiant yellow.', .13),
      ('Anahata', 'Heart. Twelve petals, the star of two triangles: green.', .33),
      ('Vishuddha', 'Throat. Sixteen petals around the circle of ether: blue.', .56),
      ('Ajna', 'Third eye. Two petals and Om between them: indigo.', .68),
      ('Sahasrara', 'Crown. The thousand-petalled lotus: violet light.', .79)]
new = [
    P('Flower of Life', 'Sacred', 'mandala', "Nineteen circles, every centre on another's edge, folded into six mirrors. The oldest pattern of creation.", geo='Flower of Life', space=1, kal=6, pal=1, h=.48, hr=.55, field=5, fs=.25, echo=.25, ezoom=.15, gsz=1.05, grot=.06, gcnt=-.1, gswirl=.3),
    P('Metatron', 'Sacred', 'torus', "Metatron's Cube: thirteen spheres and every line between them, holding all five Platonic solids.", geo="Metatron's Cube", pal=7, h=.08, hr=.45, field=1, fs=.3, gsz=1.15, grot=.05, gcnt=-.08, gcm=1),
    P('Sri Yantra', 'Sacred', 'prism', 'Nine interlocking triangles around the bindu: four of Shiva, five of Shakti, ringed by lotus and gates.', geo='Sri Yantra', pal=5, h=.97, hr=.35, field=2, fs=.22, gsz=1.12, grot=.04, gswirl=.2),
    P('Merkaba', 'Sacred', 'prism', 'Two tetrahedra turning against each other: the light-body vehicle, in a three-mirror kaleidoscope.', geo='Merkaba', space=2, tile=1.1, drift=.1, pal=9, h=.55, hr=.6, field=4, fs=.3, gsz=.9, grot=.12, gcnt=-.15),
    P('Seed of Life', 'Sacred', 'phi', 'Seven circles of the first six days, folded twelve ways and pulled into a tunnel.', geo='Seed of Life', space=1, kal=12, foldDepth=2, pal=8, h=.55, hr=.4, echo=.5, ezoom=.35, gsz=.95, grot=.08, gcnt=-.12),
    P('Golden Spiral', 'Sacred', 'spiral', 'Fibonacci squares and the spiral that grows by phi every quarter turn, inside space that does the same.', geo='Golden Spiral', space=4, growth=6.854, arms=1, tile=1, drift=.15, pal=7, h=.06, hr=.35, field=3, fs=.35, gsz=.9),
    P('Torus', 'Sacred', 'torus', 'Thirty-six circles around one centre trace the torus; the field flows up through its heart and around.', geo='Torus', pal=4, h=.0, hr=.7, field=1, fs=.35, gsz=1.1, grot=.1, gcnt=-.1),
    P('Yin Yang', 'Sacred', 'infinity', 'Two halves, each holding a seed of the other, turning in a slow vortex.', geo='Yin Yang', pal=0, h=.55, hr=.5, field=2, fs=.25, gsz=1.1, grot=.15, gcnt=.15),
    P('Islamic Star', 'Sacred', 'mandala', "A twelve-fold star rosette, mirrored into the endless tiling of a mosque ceiling.", geo='Islamic Twelve', space=1, kal=12, pal=2, h=.95, hr=.45, gsz=1, grot=.05, gcnt=-.07, gcm=1),
    P('Tree of Life', 'Sacred', 'phi', 'Ten sephirot and twenty-two paths: the Kabbalah map from crown to kingdom.', geo='Tree of Life', pal=3, h=.5, hr=.5, field=5, fs=.2, gsz=1.15),
] + [P(n, 'Chakra', 'torus', a, geo=n, pal=0, h=h, hr=.12, field=5, fs=.22, gsz=1.12, grot=.06, gcnt=-.09, gcm=2) for n, a, h in CH] + [
    P('Kundalini', 'Chakra', 'spiral', 'Serpent energy rising through all seven centres, rainbow from root to crown.', geo='Seven Chakras', pal=1, h=.0, hr=.85, field=1, fs=.3, gsz=1.15),
    P('Ganesha', 'Divine', 'user', 'Remover of obstacles: crown, fan ears and curling trunk in a halo of petals.', geo='Ganesha', pal=5, h=.04, hr=.3, field=5, fs=.2, gsz=1.25),
    P('Om', 'Divine', 'phi', 'The first sound, in a ring of lotus light that hums with the music.', geo='Om', pal=7, h=.07, hr=.35, echo=.35, ezoom=.2, field=5, fs=.2, gsz=1.2),
    P('Shiva', 'Divine', 'prism', 'The trident in a ring of fire: creation, preservation, dissolution.', geo='Trishul', pal=8, h=.58, hr=.4, field=2, fs=.25, gsz=1.15),
    P('Nataraja', 'Divine', 'torus', 'The cosmic dance: Om at the still centre of a ring of flames.', geo='Nataraja Fire', pal=5, h=.02, hr=.4, field=1, fs=.3, gsz=1.15, grot=.1, gcnt=-.15),
    P('Meditation', 'Divine', 'user', 'A seated figure, seven lights along the spine, a halo that breathes.', geo='Meditation', pal=4, h=.55, hr=.5, field=5, fs=.18, gsz=1.25),
    P('Dharma Wheel', 'Divine', 'mandala', 'Eight spokes of the noble path, turning in an eight-fold mirror.', geo='Dharma Wheel', space=1, kal=8, pal=7, h=.1, hr=.3, gsz=1.05, grot=.2, gcnt=-.1),
    P('All-Seeing Eye', 'Divine', 'phi', 'The eye of providence in its triangle, rays falling into an endless tunnel.', geo='Eye of Providence', pal=2, h=.0, hr=.4, echo=.55, ezoom=.4, gsz=1.1),
    P('Times Table', 'Math', 'spiral', 'Point n joined to point n×k on a circle. As k grows, cardioids, nephroids and roses appear and dissolve.', geo='Times Table', pal=1, h=.6, hr=1, field=2, fs=.15, gsz=1.15, grot=.03, gcnt=-.03),
    P('Spirograph', 'Math', 'spiral', 'Wheels rolling inside wheels: hypotrochoid lace that slowly re-weaves itself.', geo='Spirograph', pal=9, h=.8, hr=.6, field=5, fs=.2, gsz=1.1, grot=.1, gcnt=-.14),
    P('Tesseract', 'Math', 'prism', 'A four-dimensional cube turning through our three dimensions, falling down an echo tunnel.', geo='Tesseract', pal=8, h=.55, hr=.5, echo=.55, ezoom=.3, gsz=1.0, grot=.05),
    P('Platonic', 'Math', 'prism', 'All five Platonic solids nested and turning, each at its own pace.', geo='Platonic Nest', pal=4, h=.3, hr=.7, field=1, fs=.25, gsz=1.1),
    P('Lorenz', 'Math', 'infinity', 'The butterfly attractor: deterministic chaos, never repeating, never escaping.', geo='Lorenz', pal=5, h=.98, hr=.4, field=5, fs=.2, gsz=1.15, grot=.0),
    P('Cymatics', 'Math', 'mandala', 'Chladni figures: the nodal lines where a vibrating plate stays still, changing mode with the song.', geo='Chladni', pal=3, h=.48, hr=.5, gsz=1.2, field=5, fs=.15),
    P('Interference', 'Math', 'torus', 'Three wave sources meeting: rings that cancel and reinforce across the whole screen.', geo='Interference', pal=9, h=.5, hr=.6, gsz=1.3),
    P('Mandelbrot', 'Math', 'spiral', 'The edge of the Mandelbrot set: infinite coastline, every bay a smaller copy.', geo='Mandelbrot', pal=1, h=.55, hr=.7, field=5, fs=.15, gsz=1.25),
    P('Apollonian', 'Math', 'mandala', 'Circles packed into the gaps between circles, forever.', geo='Apollonian', space=1, kal=6, pal=8, h=.5, hr=.45, gsz=1.0, grot=.05),
    P('Penrose', 'Math', 'prism', 'Five-fold order that never repeats: kites and darts of the aperiodic tiling.', geo='Penrose', pal=2, h=.9, hr=.5, gsz=1.15, grot=.03),
    P('Snowflake', 'Math', 'mandala', "Koch's infinite coastline, six times mirrored into crystal.", geo='Koch Snowflake', space=1, kal=6, pal=8, h=.52, hr=.3, gsz=1.0, grot=.06),
    P('Hypnotic', 'Psychedelic', 'spiral', 'Six arms turning into an infinite echo tunnel.', geo='Hypno Spiral', pal=9, h=.75, hr=.8, echo=.7, ezoom=.45, etwist=.2, gsz=1.2, grot=.35),
    P('Moiré', 'Psychedelic', 'torus', 'Two families of rings sliding over each other: interference you feel in your eyes.', geo='Moiré Rings', pal=1, h=.0, hr=1, gsz=1.3, grot=.08, gcnt=-.08),
    P('Vortex Squares', 'Psychedelic', 'prism', 'Thirty squares, each a little smaller and a little turned, spiralling into the centre.', geo='Twisted Squares', pal=1, h=.1, hr=.9, echo=.55, etwist=.3, ezoom=.2, gsz=1.15, grot=.25),
    P('Hyperbolic Hive', 'Psychedelic', 'prism', 'A honeycomb folded into the hyperbolic plane: seven hexagons where six should fit.', geo='Honeycomb', space=3, hp=7, hq=3, drift=.25, pal=9, h=.5, hr=.6, gsz=.8),
    P('Sunburst', 'Psychedelic', 'phi', 'Seventy-two rays and nine rings pouring out of the centre.', geo='Sunburst', pal=2, h=.05, hr=.5, echo=.6, ezoom=-.35, gsz=1.2, grot=.1, gcnt=-.1),
    P('Op Art', 'Psychedelic', 'mandala', 'A logarithmic checkerboard twisting into the centre, folded into eight.', geo='Radial Checker', space=1, kal=8, pal=9, h=.85, hr=.5, gsz=1.4, grot=.15),
]
# Fluid-only scenes worth keeping, recategorised. The Matter set is dropped: its look came from material settings
# that are now shared by every preset.
keep = {'Phi': 'Sacred', 'Infinity': 'Sacred', 'Prism': 'Sacred', 'Loxodrome': 'Sacred', 'Nebula': 'Cosmos', 'Fireflies': 'Cosmos',
        'Aurora': 'Cosmos', 'Ember': 'Fluid', 'Ocean': 'Fluid', 'Smoke': 'Fluid', 'Acid': 'Psychedelic', 'Tunnel': 'Psychedelic', 'Genesis': 'Psychedelic'}
fluid = []
for n, c in keep.items():
    x = dict(old[n]); x['c'] = c; fluid.append(x)
d['presets'] = new + fluid + classic
d['categories'] = ['Sacred', 'Chakra', 'Divine', 'Math', 'Psychedelic', 'Cosmos', 'Fluid', 'Classic']
dump(d, ROOT / 'shared/presets.json')
print(len(new), 'geometry presets,', len(fluid), 'fluid,', len(classic), 'classic')
