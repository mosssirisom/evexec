from http.server import BaseHTTPRequestHandler
import json
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        admin_password = os.environ.get('ADMIN_PASSWORD', '')
        supplied = self.headers.get('x-admin-password', '')

        if not admin_password or supplied != admin_password:
            self.send_response(401)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'Unauthorised'}).encode())
            return

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({
            'quote_requests': [],
            'contact_messages': [],
            'message': 'Admin leads endpoint active. Supabase read wiring next.'
        }).encode())
