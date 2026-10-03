"""Local dev server: serves the repo on 127.0.0.1 and accepts POST /shot?name=x (image bytes) into .shots/.
The page posts canvas snapshots so frames can be inspected without relying on window compositing."""
import http.server, pathlib, re, sys, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / '.shots'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = re.sub(r'[^A-Za-z0-9_.-]', '_', q.get('name', ['shot'])[0])[:60]
        data = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        SHOTS.mkdir(exist_ok=True)
        (SHOTS / (name + '.jpg')).write_bytes(data)
        self.send_response(204); self.end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
