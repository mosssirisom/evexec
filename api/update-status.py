from http.server import BaseHTTPRequestHandler
import json
import os
import urllib.request

ALLOWED_TABLES = ['quote_requests', 'contact_messages']
ALLOWED_STATUS = ['new', 'contacted', 'quoted', 'booked', 'lost']

class handler(BaseHTTPRequestHandler):
    def send_json(self, code, payload):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_PATCH(self):
        try:
            admin_password = os.environ.get('ADMIN_PASSWORD', '')
            supplied = self.headers.get('x-admin-password', '')

            if not admin_password or supplied != admin_password:
                self.send_json(401, {'error': 'Unauthorised'})
                return

            length = int(self.headers.get('content-length', 0))
            raw = self.rfile.read(length).decode('utf-8') if length else '{}'
            body = json.loads(raw or '{}')

            table = body.get('table')
            lead_id = body.get('id')
            status = body.get('status')

            if table not in ALLOWED_TABLES:
                self.send_json(400, {'error': 'Invalid table'})
                return

            if status not in ALLOWED_STATUS:
                self.send_json(400, {'error': 'Invalid status'})
                return

            if not lead_id:
                self.send_json(400, {'error': 'Missing lead id'})
                return

            supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
            service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

            if not supabase_url or not service_key:
                self.send_json(500, {'error': 'Supabase environment variables missing'})
                return

            url = supabase_url.rstrip('/') + '/rest/v1/' + table + '?id=eq.' + lead_id
            payload = {'status': status}

            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode(),
                method='PATCH',
                headers={
                    'apikey': service_key,
                    'Authorization': 'Bearer ' + service_key,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            )

            with urllib.request.urlopen(req) as response:
                updated = json.loads(response.read().decode() or '[]')

            self.send_json(200, {'success': True, 'updated': updated})
        except Exception as error:
            self.send_json(500, {'error': str(error)})
