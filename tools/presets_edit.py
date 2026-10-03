"""Edit shared/presets.json in place, keeping one preset per line.
Usage: python tools/presets_edit.py updates.json   (updates: {"Preset name": {"param": value, ...}, ...}; null deletes a param)"""
import json, sys, pathlib

PATH = pathlib.Path(__file__).resolve().parent.parent / 'shared' / 'presets.json'

def dump(d):
    out = ['{']
    out.append('  "categories": ' + json.dumps(d['categories']) + ',')
    out.append('  "particleStyles": ' + json.dumps(d['particleStyles'], separators=(',', ':')) + ',')
    out.append('  "classicBase": ' + json.dumps(d['classicBase'], separators=(',', ':')) + ',')
    out.append('  "presets": [')
    out.append(',\n'.join('    ' + json.dumps(p, separators=(',', ':'), ensure_ascii=False) for p in d['presets']))
    out.append('  ],')
    out.append('  "icons": {')
    out.append(',\n'.join(f'    {json.dumps(k)}:{json.dumps(v)}' for k, v in d['icons'].items()))
    out.append('  }\n}\n')
    return '\n'.join(out)

def main():
    d = json.loads(PATH.read_text(encoding='utf-8'))
    if len(sys.argv) > 1:
        upd = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
        by = {p['n']: p for p in d['presets']}
        for name, changes in upd.items():
            if name not in by:
                raise SystemExit('unknown preset ' + name)
            for k, v in changes.items():
                if k == '_about':
                    by[name]['about'] = v
                elif v is None:
                    by[name]['p'].pop(k, None)
                else:
                    by[name]['p'][k] = v
    PATH.write_text(dump(d), encoding='utf-8', newline='\n')
    print('presets:', len(d['presets']))

main()
