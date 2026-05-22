from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request

class handler(BaseHTTPRequestHandler):
    def send_json(self, code, payload):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def fetch_table(self, table):
        supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
        service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        url = supabase_url.rstrip('/') + '/rest/v1/' + table + '?select=*&order=created_at.desc'
        req = urllib.request.Request(url, headers={
            'apikey': service_key,
            'Authorization': 'Bearer ' + service_key,
            'Content-Type': 'application/json'
        })
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode() or '[]')

    def do_GET(self):
        try:
            admin_password = os.environ.get('ADMIN_PASSWORD', '')
            supplied = self.headers.get('x-admin-password', '')

            if not admin_password or supplied != admin_password:
                self.send_json(401, {'error': 'Unauthorised'})
                return

            if not os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or not os.environ.get('SUPABASE_SERVICE_ROLE_KEY'):
                self.send_json(500, {'error': 'Supabase environment variables missing'})
                return

            quotes = self.fetch_table('quote_requests')
            contacts = self.fetch_table('contact_messages')

            self.send_json(200, {
                'quote_requests': quotes,
                'contact_messages': contacts
            })
        except Exception as error:
            self.send_json(500, {'error': str(error)})
