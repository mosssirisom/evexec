import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Script from 'next/script';

export async function getStaticProps() {
  const htmlPath = path.join(process.cwd(), 'index.html');
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
      bodyHtml: bodyMatch ? bodyMatch[1] : html,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
    }
  };
}

export default function Home({ headHtml, bodyHtml, googleMapsApiKey }) {
  return (
    <>
      <Head>
        <title>EV Exec | Premium Airport Transfers — Blackpool, Fylde & Wyre</title>
        <meta name="description" content="Premium airport transfers from Blackpool and the Fylde Coast. Fixed prices, flight monitoring, Tesla Model Y comfort and reliable local professional service." />
      </Head>
      <div dangerouslySetInnerHTML={{ __html: `${headHtml}${bodyHtml}` }} />
      <Script id="evexec-google-key" strategy="beforeInteractive">
        {`window.EVEXEC_GOOGLE_MAPS_API_KEY=${JSON.stringify(googleMapsApiKey || '')};`}
      </Script>
      <Script src="/js/google-places-autocomplete.js?v=evexec-20260609b" strategy="afterInteractive" />
      <Script src="/js/booking-hardening.js?v=evexec-20260609" strategy="afterInteractive" />
    </>
  );
}
