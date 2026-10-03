"""Generate the Dynamic logo (psychedelic kaleidoscope). Writes web/icon.png, docs/icon-512.png and Android launcher icons.
Math: a 12-fold mirrored wedge, a golden log-spiral twist (growth phi per quarter turn), interfering waves coloured
with a cosine palette, a bright toroidal ring and a white-hot core. Deterministic: no randomness."""
import math, pathlib
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHI = (1 + 5 ** .5) / 2

def ridge(x, w=.1):
    """Thin bright line wherever sin(x) crosses zero."""
    return np.exp(-(np.abs(np.sin(x)) / w) ** 2)

def render(n=1024, folds=12):
    y, x = np.mgrid[0:n, 0:n].astype(np.float64)
    x = (x - n / 2 + .5) / (n / 2); y = (y - n / 2 + .5) / (n / 2)
    r = np.hypot(x, y) + 1e-9; th = np.arctan2(y, x)
    k = math.log(PHI) / (math.pi / 2)                  # log-spiral: r grows by phi every quarter turn
    th = th + .55 * k * np.log(r)
    w = 2 * math.pi / folds
    thf = th.copy()                                  # unfolded angle: periodic, so a hue offset from it has no seam
    th = np.abs(((th % w) + w) % w - w / 2)             # mirrored wedge, 12 copies
    u, v = r * np.cos(th), r * np.sin(th)
    L = np.zeros_like(r)
    for fr, ang, wt in [(21, .0, 1.0), (34, 1.05, .8), (55, 2.1, .6), (13, .5, .9)]:   # Fibonacci frequencies
        L += wt * ridge(fr * (u * math.cos(ang) + v * math.sin(ang)) + 2.2 * np.sin(8 * r), .09)
    L += 1.1 * ridge(math.pi * np.log(r) / math.log(PHI), .07) * (r < .98)            # rings at golden ratios
    L += .9 * ridge(6 * th * (folds / 6) - 9 * np.log(r) * PHI, .08)                  # spiral arms
    L = np.clip(L, 0, 2.5)
    t = r * 1.5 + .13 * np.sin(thf) + .07 * np.sin(2 * thf + 1) + .1 * np.sin(5 * r + th * 3)
    def pal(t, d):
        return .5 + .5 * np.cos(2 * math.pi * (t[..., None] + np.array(d)))
    col = pal(t, [0.0, .33, .67]) * (1 - .3) + pal(t * 1.9 + .3, [.85, .15, .25]) * .3
    lum = col.mean(axis=2, keepdims=True); col = lum + (col - lum) * 1.5
    line = L[..., None] * col
    img = Image.fromarray((np.clip(line / 2.2, 0, 1) * 255).astype(np.uint8), 'RGB')
    bloom = np.asarray(img.filter(ImageFilter.GaussianBlur(n / 60)), dtype=np.float64) / 255 * 1.4 +             np.asarray(img.filter(ImageFilter.GaussianBlur(n / 16)), dtype=np.float64) / 255 * .9
    base = line / 1.3 + bloom
    core = np.exp(-(r / .09) ** 2) * 1.6 + np.exp(-((r - .62) / .02) ** 2) * .5
    base = base + core[..., None] * np.array([1.0, .92, .82])
    nebula = np.array([.05, .02, .12]) * np.exp(-2.5 * r)[..., None] + np.array([.02, .03, .08])
    out = 1 - np.exp(-(base + nebula) * 1.5)
    edge = np.clip((.985 - r) / .03, 0, 1)[..., None]
    bg = np.array([5, 6, 10]) / 255.
    out = bg * (1 - edge) + out * edge
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)

def save_variants(img):
    base = Image.fromarray(img, 'RGB')
    (ROOT / 'web').mkdir(exist_ok=True)
    base.resize((48, 48), Image.LANCZOS).save(ROOT / 'web' / 'favicon.png', optimize=True)
    (ROOT / 'docs').mkdir(exist_ok=True)
    for size in (192, 512):
        base.resize((size, size), Image.LANCZOS).save(ROOT / 'docs' / f'icon-{size}.png', optimize=True)
    res = ROOT / 'app' / 'src' / 'main' / 'res'
    if res.exists():
        sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
        for d, s in sizes.items():
            out = res / f'mipmap-{d}'; out.mkdir(parents=True, exist_ok=True)
            sq = base.resize((s, s), Image.LANCZOS)
            sq.save(out / 'ic_launcher.png')
            # round variant
            mask = Image.new('L', (s * 4, s * 4), 0)
            from PIL import ImageDraw
            ImageDraw.Draw(mask).ellipse((0, 0, s * 4 - 1, s * 4 - 1), fill=255)
            mask = mask.resize((s, s), Image.LANCZOS)
            rd = Image.new('RGBA', (s, s)); rd.paste(sq.convert('RGBA'), (0, 0), mask); rd.save(out / 'ic_launcher_round.png')
        # adaptive foreground: artwork inside the 66% safe zone of a 432px layer
        fg = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
        art = base.resize((288, 288), Image.LANCZOS).convert('RGBA')
        mask = Image.new('L', (288 * 4, 288 * 4), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(mask).ellipse((0, 0, 288 * 4 - 1, 288 * 4 - 1), fill=255)
        mask = mask.resize((288, 288), Image.LANCZOS)
        fg.paste(art, (72, 72), mask)
        out = res / 'drawable-nodpi'; out.mkdir(parents=True, exist_ok=True)
        fg.save(out / 'ic_launcher_foreground.png')
    return base

if __name__ == '__main__':
    img = render(1024)
    save_variants(img)
    Image.fromarray(img).resize((384, 384), Image.LANCZOS).save(ROOT / '.shots' / 'logo_preview.png')
    print('logo done')
