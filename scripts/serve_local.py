"""Loopback-only preview with one fixed read-only refresh operation."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from urllib.parse import urlsplit

import refresh_all_data as refresh
import refresh_crm_ssot as ssot

LOCK = threading.Lock()


def refresh_worker():
    try:
        with refresh.refresh_lock(ssot.ROOT / '.local/data-refresh.lock'):
            refresh.run()
    finally:
        LOCK.release()


class Handler(SimpleHTTPRequestHandler):
    def reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.allowed_host():
            return self.reply(403, {'error': 'invalid_host'})
        path = urlsplit(self.path).path
        if path == '/api/local-refresh':
            return self.reply(200, {'available': True, 'running': LOCK.locked()})
        # Never expose local credentials, logs, source scripts, or git metadata.
        if path not in ('/', '/index.html', '/favicon.ico') and not any(path.startswith(prefix) for prefix in ('/assets/', '/data/')):
            return self.reply(404, {'error': 'not_found'})
        target = self.translate_path(self.path)
        from pathlib import Path
        resolved = (Path(target) / 'index.html' if path == '/' else Path(target)).resolve()
        if not resolved.is_file() or not resolved.is_relative_to(ssot.ROOT.resolve()):
            return self.reply(404, {'error': 'not_found'})
        if resolved.relative_to(ssot.ROOT.resolve()).parts[0] not in ('assets', 'data', 'index.html', 'favicon.ico'):
            return self.reply(404, {'error': 'not_found'})
        if path.startswith(('/assets/', '/data/')) and any(part.startswith('.') or part == '..' for part in resolved.relative_to(ssot.ROOT.resolve()).parts):
            return self.reply(404, {'error': 'not_found'})
        return super().do_GET()

    def do_HEAD(self):
        return self.reply(405, {'error': 'method_not_allowed'})

    def do_POST(self):
        if self.path != '/api/local-refresh':
            return self.reply(404, {'error': 'not_found'})
        if not self.allowed_host() or self.headers.get('Origin') != 'http://' + self.headers.get('Host', '') or self.headers.get('X-Panorama-Refresh') != '1':
            return self.reply(403, {'error': 'same_origin_required'})
        if not LOCK.acquire(blocking=False):
            return self.reply(202, {'started': False, 'running': True})
        threading.Thread(target=refresh_worker, daemon=True).start()
        return self.reply(202, {'started': True, 'running': True})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8020)
    server = ThreadingHTTPServer(('127.0.0.1', parser.parse_args().port), partial(Handler, directory=str(ssot.ROOT)))
    server.serve_forever()
