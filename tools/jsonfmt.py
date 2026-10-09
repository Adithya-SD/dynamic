"""Write shared JSON the way it is kept in git: one top-level key per block, one list item per line."""
import json, sys

def dump(obj, path):
    c = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    out = ['{']
    keys = list(obj)
    for i, k in enumerate(keys):
        v, end = obj[k], ',' if i < len(keys) - 1 else ''
        if isinstance(v, list) and v and isinstance(v[0], (dict, list)):
            out.append(f'  {json.dumps(k)}: [')
            out += [f'    {c(x)}' + (',' if j < len(v) - 1 else '') for j, x in enumerate(v)]
            out.append('  ]' + end)
        elif isinstance(v, dict) and len(c(v)) > 160:
            out.append(f'  {json.dumps(k)}: {{')
            ks = list(v)
            out += [f'    {json.dumps(kk)}: {c(v[kk])}' + (',' if j < len(ks) - 1 else '') for j, kk in enumerate(ks)]
            out.append('  }' + end)
        else:
            out.append(f'  {json.dumps(k)}: {c(v)}{end}')
    out.append('}')
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')

if __name__ == '__main__':
    for p in sys.argv[1:]:
        dump(json.load(open(p, encoding='utf-8')), p)
