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

    def do_POST(self):
        try:
            length = int(self.headers.get('content-length', 0))
            raw = self.rfile.read(length).decode('utf-8') if length else '{}'
            body = json.loads(raw or '{}')

            name = body.get('customer_name') or body.get('name')
            phone = body.get('phone')

            if not name or not phone:
                self.send_json(400, {'error': 'Name and phone are required'})
                return

            supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
            service_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

            if not supabase_url or not service_key:
                self.send_json(500, {'error': 'Supabase environment variables missing'})
                return

            payload = {
                'customer_name': name,
                'phone': phone,
                'email': body.get('email', ''),
                'pickup_location': body.get('pickup_location', ''),
                'destination': body.get('destination', ''),
                'pickup_date': body.get('pickup_date') or None,
                'pickup_time': body.get('pickup_time', ''),
                'passengers': int(body.get('passengers') or 1),
                'luggage': body.get('luggage', ''),
                'return_required': bool(body.get('return_required', False)),
                'return_date': body.get('return_date') or None,
                'return_time': body.get('return_time', ''),
                'notes': body.get('notes', ''),
                'status': 'new'
            }

            req = urllib.request.Request(
                supabase_url.rstrip('/') + '/rest/v1/quote_requests',
                data=json.dumps(payload).encode(),
                method='POST',
                headers={
                    'apikey': service_key,
                    'Authorization': 'Bearer ' + service_key,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            )

            with urllib.request.urlopen(req) as response:
                saved = json.loads(response.read().decode() or '[]')

            self.send_json(200, {'success': True, 'lead': saved})
        except Exception as error:
            self.send_json(500, {'error': str(error)})
