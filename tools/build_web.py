"""Bundle the web app into one self-contained HTML file: docs/index.html (served by GitHub Pages).

Shared sources (also consumed by the Android build):
  shared/shaders/*.glsl|vert|frag  GLSL ES 3.00 bodies; common.glsl is prepended, #include "x" is inlined
  shared/params.json               every setting: tab, group, range, default
  shared/presets.json              curated presets, classic pack, particle styles, icons
Web sources: web/index.html (shell + CSS) and web/src/*.js (concatenated in name order).
"""
import base64, datetime, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SH = ROOT / 'shared' / 'shaders'

def resolve(name, seen=()):
    if name in seen:
        raise SystemExit(f'include cycle: {name}')
    text = (SH / name).read_text(encoding='utf-8')
    return re.sub(r'#include "([^"]+)"', lambda m: resolve(m.group(1), seen + (name,)), text)

def shaders():
    common = resolve('common.glsl')
    out = {}
    for f in sorted(SH.iterdir()):
        if f.suffix in ('.vert', '.frag'):
            out[f.name] = common + '\n' + resolve(f.name)
    return out

def build_id():
    '''Which build is this? Short git hash (+ when the sources have uncommitted edits) and the time, shown in System.'''
    try:
        h = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip() or 'dev'
        dirty = subprocess.run(['git', 'status', '--porcelain', '--', 'web', 'shared', 'pc', 'app', 'wear', 'tools'], cwd=ROOT, capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        h, dirty = 'dev', ''
    return {'id': h + ('+' if dirty else ''), 't': datetime.datetime.now().strftime('%d %b %H:%M')}

def build():
    html = (ROOT / 'web' / 'index.html').read_text(encoding='utf-8')
    js = '\n'.join(f.read_text(encoding='utf-8') for f in sorted((ROOT / 'web' / 'src').glob('*.js')))
    data = ('const SHADERS=' + json.dumps(shaders(), separators=(',', ':')) + ';\n'
            'const SCHEMA=' + json.dumps(json.loads((ROOT / 'shared' / 'params.json').read_text(encoding='utf-8')), separators=(',', ':')) + ';\n'
            'const PRESETS=' + json.dumps(json.loads((ROOT / 'shared' / 'presets.json').read_text(encoding='utf-8')), separators=(',', ':')) + ';\n'
            'const BUILD=' + json.dumps(build_id()) + ';\n')
    html = html.replace('<!--SCRIPT-->', '<script>\n' + data + js + '\n</script>')
    icon = ROOT / 'web' / 'favicon.png'
    links = '<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icon-192.png">'
    if icon.exists():
        links = f'<link rel="icon" type="image/png" href="data:image/png;base64,{base64.b64encode(icon.read_bytes()).decode()}">' + links
    html = html.replace('<!--ICON-->', links)
    manifest = {'name': 'Dynamic', 'short_name': 'Dynamic', 'description': 'A GPU fluid simulation where math, music and touch become living light.',
                'start_url': '.', 'display': 'fullscreen', 'orientation': 'any', 'background_color': '#05060a', 'theme_color': '#05060a',
                'icons': [{'src': 'icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any maskable'}]}
    (ROOT / 'docs').mkdir(exist_ok=True)
    (ROOT / 'docs' / 'manifest.webmanifest').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    (ROOT / 'docs' / '.nojekyll').write_text('', encoding='utf-8')
    out = ROOT / 'docs' / 'index.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'Built {out.relative_to(ROOT)}: {len(html.encode()):,} bytes')

PAD_SOURCES = ['src/00_util.js', 'src/40_audio.js', 'src/42_beat.js', 'src/46_pad.js', 'pad/main.js']

def build_pad():
    """Dynamic Pad: the controller-only music feeler. Shares util, audio analysis and the controller core."""
    html = (ROOT / 'web' / 'pad.html').read_text(encoding='utf-8')
    js = '\n'.join((ROOT / 'web' / f).read_text(encoding='utf-8') for f in PAD_SOURCES)
    html = html.replace('<!--SCRIPT-->', '<script>\nconst TAU=Math.PI*2;\n' + js + '\n</script>')
    icon = ROOT / 'web' / 'favicon.png'
    if icon.exists():
        html = html.replace('<!--ICON-->', f'<link rel="icon" type="image/png" href="data:image/png;base64,{base64.b64encode(icon.read_bytes()).decode()}">')
    out = ROOT / 'docs' / 'pad.html'
    out.write_text(html, encoding='utf-8')
    print(f'Built {out.relative_to(ROOT)}: {len(html.encode()):,} bytes')

def build_watch():
    """Dynamic Lite: the Wear OS page (plain Canvas 2D, no shared engine)."""
    src = (ROOT / 'web' / 'watch.html').read_text(encoding='utf-8')
    (ROOT / 'docs' / 'watch.html').write_text(src, encoding='utf-8')
    print(f'Built docs/watch.html: {len(src.encode()):,} bytes')

if __name__ == '__main__':
    build()
    build_pad()
    build_watch()
