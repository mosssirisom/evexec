'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const checks = {
    supabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabaseAnon: Boolean(process.env.SUPABASE_ANON_KEY),
    stripeSecret: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    googleMapsApiKey: Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    siteUrl: Boolean(process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL)
  };

  const required = ['supabaseServiceRole', 'stripeSecret', 'googleMapsApiKey'];
  const missingRequired = required.filter(function(key){
    return !checks[key];
  });

  res.statusCode = missingRequired.length ? 500 : 200;
  res.end(JSON.stringify({
    ok: missingRequired.length === 0,
    checkedAt: new Date().toISOString(),
    deployment: 'evexec-booking-stabilised-20260609',
    checks,
    missingRequired
  }));
};