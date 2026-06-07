'use strict';

const crypto = require('crypto');
const { sendSMS, sendEmail, normaliseUkPhone } = require('../../lib/notify');

function authOk(req) {
  const secret = req.headers['x-operator-secret'];
  const expected = process.env.OPERATOR_ACTION_SECRET;
  return expected && secret && secret.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
}

function mask(value) {
  if (!value) return null;
  const str = String(value);
  if (str.length <= 6) return 'set';
  return str.slice(0, 3) + '***' + str.slice(-3);
}

function envStatus() {
  return {
    twilio: {
      accountSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
      authToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
      phoneNumber: Boolean(process.env.TWILIO_PHONE_NUMBER),
      from: mask(normaliseUkPhone(process.env.TWILIO_PHONE_NUMBER || '')),
      ready: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
    },
    resend: {
      apiKey: Boolean(process.env.RESEND_API_KEY),
      from: process.env.RESEND_FROM || 'EV Exec <bookings@evexec.co.uk>',
      ready: Boolean(process.env.RESEND_API_KEY)
    },
    operator: {
      phone: Boolean(process.env.OPERATOR_PHONE),
      email: Boolean(process.env.OPERATOR_EMAIL),
      phonePreview: mask(normaliseUkPhone(process.env.OPERATOR_PHONE || '')),
      emailPreview: process.env.OPERATOR_EMAIL ? process.env.OPERATOR_EMAIL.replace(/(.{2}).+(@.+)/, '$1***$2') : null
    },
    site: {
      siteUrl: process.env.SITE_URL || 'https://evexec.co.uk'
    }
  };
}

async function runLiveTest(body) {
  const channels = Array.isArray(body.channels) && body.channels.length ? body.channels : ['sms', 'email'];
  const toPhone = body.to_phone || process.env.OPERATOR_PHONE;
  const toEmail = body.to_email || process.env.OPERATOR_EMAIL;
  const stamp = new Date().toISOString();
  const results = [];

  if (channels.includes('sms')) {
    try {
      if (!toPhone) throw new Error('No SMS recipient provided and OPERATOR_PHONE is missing');
      await sendSMS(toPhone, `EV Exec notification health test successful. ${stamp}`);
      results.push({ channel: 'sms', ok: true, to: mask(normaliseUkPhone(toPhone)) });
    } catch (err) {
      console.error('Notification health SMS test failed:', err);
      results.push({ channel: 'sms', ok: false, error: err.message || String(err) });
    }
  }

  if (channels.includes('email')) {
    try {
      if (!toEmail) throw new Error('No email recipient provided and OPERATOR_EMAIL is missing');
      await sendEmail({
        to: toEmail,
        subject: 'EV Exec notification health test',
        html: `<p>EV Exec notification health test successful.</p><p>${stamp}</p>`
      });
      results.push({ channel: 'email', ok: true, to: toEmail.replace(/(.{2}).+(@.+)/, '$1***$2') });
    } catch (err) {
      console.error('Notification health email test failed:', err);
      results.push({ channel: 'email', ok: false, error: err.message || String(err) });
    }
  }

  return results;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!authOk(req)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorised' }));
  }

  if (req.method === 'GET') {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, environment: envStatus() }));
  }

  if (req.method === 'POST') {
    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }

    const tests = await runLiveTest(body);
    res.statusCode = tests.every(t => t.ok) ? 200 : 207;
    return res.end(JSON.stringify({ ok: tests.every(t => t.ok), environment: envStatus(), tests }));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
