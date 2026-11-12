'use strict';
// Shared fake database + request helpers for tests that run the website's API
// handlers. Records every row the website creates (POSTs to /rest/v1/<table>).
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-unit';
process.env.RESEND_API_KEY = 're_unit';
process.env.OPERATOR_ACTION_SECRET = 'unit-secret';
process.env.SITE_URL = 'https://site.test';

const posts = [];
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

// tenantRows: what GET /rest/v1/tenants returns (pricing and brand lookups).
function install(tenantRows) {
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = (opts.method || 'GET').toUpperCase();
    if (u.host !== 'db.test') return json({});
    const table = u.pathname.replace('/rest/v1/', '');
    if (method === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      posts.push({ table, body });
      return json([{ id: crypto.randomUUID(), ...body }], 201);
    }
    if (table === 'tenants') return json(tenantRows);
    return json([]);
  };
}

function request(path, body, method = 'POST') {
  const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  req.url = path; req.method = method; req.headers = { 'content-type': 'application/json' }; req.query = {};
  return req;
}
function response() {
  let done; const finished = new Promise((r) => { done = r; });
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { done({ status: this.statusCode, body: b }); } };
  return { res, finished };
}
async function call(handler, path, body, method) {
  const { res, finished } = response();
  await handler(request(path, body, method), res);
  return Promise.race([finished, new Promise((r) => setTimeout(() => r({ status: res.statusCode, body: '(no response)' }), 1500))]);
}

const futureDate = () => { const d = new Date(Date.now() + 20 * 86400000); return d.toISOString().slice(0, 10); };
const bookingBody = (over = {}) => ({
  journey_type: 'To Airport', airport: 'Manchester Airport', pickup_location: '1 Test Street, Southport', dropoff_address: 'Manchester Airport',
  travel_date: futureDate(), travel_time: '09:00', passengers: 2, customer_name: 'Jo Customer', customer_phone: '07000000001',
  customer_email: 'jo@example.test', terms_accepted: true, ...over,
});

module.exports = { posts, install, call, bookingBody, futureDate };
