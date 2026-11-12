'use strict';

// Privacy Policy template, filled from a business's details
// (lib/legal/details.js). The wording follows EV Exec's published policy; with
// EV Exec's own details it reproduces it (tests/unit/legal.test.cjs).
//
// The business is the data controller. The platform services listed in
// PLATFORM_PROCESSORS are the same for every business because every business
// runs on the same platform; update that list whenever a service starts
// handling customer data.
//
// DRAFT FOR REVIEW: a template, not legal advice (docs/legal/template-review.md).

const { esc, p, ul, section } = require('./render');

const PLATFORM_PROCESSORS = Object.freeze([
  'Supabase: our database and account sign-in provider (Germany)',
  'Vercel: hosts our website',
  'Stripe: takes card payments',
  'Resend: delivers our emails',
  'Google: address search in the booking form (Google Maps) and, only if you accept, website analytics (Google Analytics)',
  'AeroDataBox: receives your flight number and date only, to check flight times',
]);

const ph = (label) => `<mark class="legal-gap">[${esc(label)} to be added]</mark>`;
const email = (d) => (d.email ? `<a class="gold" href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : ph('contact email'));

function whoWeAre(d) {
  const n = esc(d.name);
  const base = d.base ? esc(d.base) : ph('where you are based');
  if (d.status === 'limited company') {
    const legal = d.legalName && d.legalName !== d.name ? `${esc(d.legalName)}, trading as ${n}` : n;
    return `${legal} is a limited company (company number ${d.companyNumber ? esc(d.companyNumber) : ph('company number')}, registered office ${d.registeredAddress ? esc(d.registeredAddress) : ph('registered office')}) providing ${esc(d.service)}, based in ${base}. We are the data controller for any personal information you provide to us.`;
  }
  const status = d.status === 'partnership' ? 'a partnership' : d.status === 'sole trader' ? 'a sole trader' : ph('trading status');
  return `${n} is ${status} providing ${esc(d.service)}, based in ${base}. We are the data controller for any personal information you provide to us.`;
}

/** The privacy policy as a list of numbered sections. */
function privacySections(d) {
  const n = esc(d.name);
  const points = d.pointsName ? esc(d.pointsName) : '';
  const contactItems = [
    `Email: ${email(d)}`,
    `Phone: ${d.phone ? esc(d.phone) : ph('contact phone')}`,
  ];
  if (d.icoRegistration && d.icoRegistration.toLowerCase() !== 'exempt') contactItems.push(`ICO registration number: ${esc(d.icoRegistration)}`);
  const processors = PLATFORM_PROCESSORS.map(esc);
  if (d.platformProvider) processors.unshift(`${esc(d.platformProvider)}: provides and runs the booking system we use, and handles your data only on our instructions`);

  return [
    section('Who We Are',
      p(whoWeAre(d)),
      p('If you have any questions about how we use your data, you can contact us at:'),
      ul(contactItems)),

    section('What Information We Collect',
      p('When you book, ask for a quote or create an account, we may collect:'),
      ul([
        'Your name and contact details (phone number and/or email address)',
        'Journey details (pickup location, destination, airport, travel date and time, extra stops)',
        'Flight information (flight number, where relevant)',
        'Passenger and luggage information',
        `If you create an account: your email address and password (stored only in encrypted form), your booking history, invoices${points ? ` and ${points}` : ''}`,
        'Payment status (paid, cash or invoiced) and, for card payments, a payment reference from our card processor',
      ]),
      p('We never see or store your full card details. Card payments are taken on a secure payment page run by Stripe.')),

    section('How We Use Your Information',
      p('We use the information you provide solely to:'),
      ul([
        'Arrange and confirm your airport transfer booking',
        'Contact you to confirm details, provide updates or follow up on your request',
        'Monitor your flight (where applicable) to ensure accurate pickup timing',
        'Send booking confirmations, reminders, receipts and invoices',
        points ? `Run your account and ${points}` : 'Run your account',
        'Respond to enquiries you send us',
        'Understand how our website is used, only if you accept analytics cookies',
        'Meet any legal obligations we are subject to',
      ]),
      p('We do not use your information for marketing purposes without your explicit consent. We will never sell or share your data with third parties for marketing.'),
      p('You do not have to give us your information, but we cannot arrange a booking without your name, contact details and journey details. We do not use automated decision-making or profiling that has a legal or similarly significant effect on you.')),

    section('Our Lawful Basis for Processing',
      p('Under UK GDPR, we rely on the following lawful bases to process your personal data:'),
      ul([
        '<strong>Contract:</strong> processing is necessary to fulfil your booking and provide the transfer service',
        '<strong>Legitimate interests:</strong> to communicate with you about your journey, monitor your flight and provide a professional service',
        '<strong>Legal obligation:</strong> where we are required to retain certain information by law, such as invoices for tax purposes',
        '<strong>Consent:</strong> for analytics cookies, which you can accept, reject or change at any time',
      ])),

    section('How We Store Your Data',
      p(`Your booking and account information is stored securely with Supabase, a cloud database provider, on servers in Frankfurt, Germany (within the European Economic Area). Only ${n} and the driver assigned to your journey can see your booking details.`),
      p('We keep booking and invoice records for six years, as required for UK tax and accounting records. You can ask us to delete your account at any time; booking and invoice records we must keep by law are retained until that period ends.'),
      p('We keep other information, such as enquiries, quote requests and messages, only for as long as we need it for the reason you gave it to us, and we delete it when you ask us to unless the law requires us to keep it.'),
      p('We take reasonable technical and organisational measures to protect your data against unauthorised access, loss or misuse.')),

    section('Who We Share Your Data With',
      p('We never sell your personal data. We share it only with the people and services needed to provide your journey:'),
      ul([
        '<strong>Our drivers:</strong> the driver assigned to your journey sees your name, phone number, journey and flight details',
        ...processors,
        'Anyone we are required to share data with by law or a regulatory authority',
      ]),
      p('Some of these providers are based in the United States. Where your data leaves the UK, it is protected by the UK–US data bridge or the UK’s approved contract clauses. You can contact us for details of the safeguards that apply.'),
      p('Text messages about your journey are sent by us or your driver from our own phones, not by an automated service.')),

    section('Cookies',
      p('<strong>Essential:</strong> we store a few items in your browser that the website needs to work, such as keeping you signed in to your account and preventing a booking from being sent twice. Our card processor, Stripe, also uses cookies on payment pages to prevent fraud. These cannot be switched off.'),
      p('<strong>Analytics (optional):</strong> Google Analytics cookies show us which pages are visited, so we can improve the website. They are only set if you tap Accept on our cookie banner. We do not use advertising cookies.'),
      p('You can change your choice at any time: <a class="gold" href="#" onclick="if(window.evxCookieSettings){evxCookieSettings();}return false;">Cookie settings</a>.')),

    section('Your Rights',
      p('Under UK GDPR, you have the following rights regarding your personal data:'),
      ul([
        '<strong>Access:</strong> request a copy of the personal data we hold about you',
        '<strong>Rectification:</strong> ask us to correct any inaccurate information',
        '<strong>Erasure:</strong> request that we delete your data, subject to any legal obligations',
        '<strong>Restriction:</strong> ask us to limit how we use your data in certain circumstances',
        '<strong>Objection:</strong> object to processing based on legitimate interests',
        '<strong>Portability:</strong> receive your data in a structured, machine-readable format',
      ]),
      p('<strong>Your right to object.</strong> You can object at any time to us using your information because of our legitimate interests (see section 4). If you do, we will stop unless we can show a compelling reason to continue.'),
      p('<strong>Withdrawing consent.</strong> Where we rely on your consent, such as for analytics cookies, you can withdraw it at any time, for example through Cookie settings (section 7).'),
      p(`To exercise any of these rights, please contact us at ${email(d)}. We will respond without undue delay and within one month. If your request is complex, or you have made several, we may take up to two further months, and we will tell you why within the first month.`),
      p(`<strong>Complaints to us.</strong> If you are unhappy with how we have handled your information, please tell us first at ${email(d)}${d.phone ? ` or on ${esc(d.phone)}` : ''}. We will acknowledge your complaint within 30 days and tell you the outcome without undue delay.`),
      p('You also have the right to lodge a complaint with the Information Commissioner\'s Office (ICO) at <a class="gold" href="https://ico.org.uk" target="_blank" rel="noopener">ico.org.uk</a> if you believe your rights have not been respected.')),

    section('External Links',
      p('Our website may contain links to external services such as Google Maps or WhatsApp. Once you leave our website, we are not responsible for the privacy practices of those sites. We encourage you to read their own privacy policies.')),

    section('Changes to This Policy',
      p('We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. The date at the top of this page shows the most recent update. If we change how we use your information in a way that affects you, we will tell you before we do.')),
  ];
}

module.exports = { privacySections, PLATFORM_PROCESSORS };
