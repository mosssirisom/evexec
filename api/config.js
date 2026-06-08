'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.statusCode = 200;

  res.end(JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || 'https://yoltkmhtxwluqxxpewbl.supabase.co',
    supabaseAnon: process.env.SUPABASE_ANON_KEY || '',
    vapidPublic: process.env.VAPID_PUBLIC_KEY || ''
  }));
};