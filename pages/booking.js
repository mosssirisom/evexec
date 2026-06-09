import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';

export async function getStaticProps() {
  const htmlPath = path.join(process.cwd(), 'booking.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  html = html
    .replace(/<!DOCTYPE html>/i, '')
    .replace(/<html[^>]*>/i, '')
    .replace(/<\/html>\s*$/i, '');

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  return {
    props: {
      headHtml: headMatch ? headMatch[1] : '',
      bodyHtml: bodyMatch ? bodyMatch[1] : html
    }
  };
}

export default function Booking({ headHtml, bodyHtml }) {
  return (
    <>
      <Head>
        <title>Your Booking | EV Exec Premium Airport Transfers</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: `${headHtml}${bodyHtml}` }} />
      <Script src="/js/booking-payment-hardening.js" strategy="afterInteractive" />
    </>
  );
}
