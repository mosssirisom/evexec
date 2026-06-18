import Head from 'next/head';
import Link from 'next/link';

const PHONE = '07721 070370';
const EMAIL = 'book@evexec.co.uk';
const SITE_URL = 'https://evexec.co.uk';

const pages = {
  'blackpool-manchester-airport-transfer': {
    title: 'Blackpool to Manchester Airport Transfers',
    meta: 'Premium Blackpool to Manchester Airport transfers with EV Exec. Fixed prices, Tesla Model Y comfort, flight monitoring and reliable door-to-door service across Blackpool.',
    from: 'Blackpool',
    airport: 'Manchester Airport',
    areas: ['North Shore', 'South Shore', 'Bispham', 'Marton', 'Stanley Park', 'Layton'],
    time: 'around 75–90 minutes',
    distance: 'approximately 60 miles',
    keywords: ['Blackpool to Manchester Airport taxi', 'Manchester Airport transfer Blackpool', 'premium airport transfer Blackpool']
  },
  'blackpool-liverpool-airport-transfer': {
    title: 'Blackpool to Liverpool Airport Transfers',
    meta: 'Premium Blackpool to Liverpool John Lennon Airport transfers by EV Exec. Tesla Model Y comfort, fixed prices and professional airport transfer service.',
    from: 'Blackpool',
    airport: 'Liverpool John Lennon Airport',
    areas: ['North Shore', 'South Shore', 'Bispham', 'Marton', 'Stanley Park', 'Layton'],
    time: 'around 75–95 minutes',
    distance: 'approximately 60 miles',
    keywords: ['Blackpool to Liverpool Airport taxi', 'Liverpool Airport transfer Blackpool', 'executive airport transfer Blackpool']
  },
  'lytham-st-annes-manchester-airport-transfer': {
    title: 'Lytham St Annes to Manchester Airport Transfers',
    meta: 'Premium Lytham St Annes to Manchester Airport transfers with EV Exec. Comfortable Tesla airport travel, fixed prices and flight monitoring included.',
    from: 'Lytham St Annes',
    airport: 'Manchester Airport',
    areas: ['Lytham', 'St Annes', 'Ansdell', 'Fairhaven', 'Hey Houses'],
    time: 'around 70–90 minutes',
    distance: 'approximately 55 miles',
    keywords: ['Lytham to Manchester Airport taxi', 'St Annes airport transfer', 'Manchester Airport transfer Lytham']
  },
  'poulton-le-fylde-manchester-airport-transfer': {
    title: 'Poulton-le-Fylde to Manchester Airport Transfers',
    meta: 'Premium Poulton-le-Fylde to Manchester Airport transfers with EV Exec. Fixed pricing, Tesla Model Y comfort and reliable local service.',
    from: 'Poulton-le-Fylde',
    airport: 'Manchester Airport',
    areas: ['Poulton centre', 'Carleton', 'Hardhorn', 'Singleton', 'Hambleton'],
    time: 'around 70–90 minutes',
    distance: 'approximately 55 miles',
    keywords: ['Poulton to Manchester Airport taxi', 'Poulton airport transfer', 'Manchester Airport transfer Poulton']
  },
  'fleetwood-manchester-airport-transfer': {
    title: 'Fleetwood to Manchester Airport Transfers',
    meta: 'Premium Fleetwood to Manchester Airport transfers by EV Exec. Tesla Model Y airport travel with fixed prices, flight monitoring and door-to-door service.',
    from: 'Fleetwood',
    airport: 'Manchester Airport',
    areas: ['Fleetwood', 'Rossall', 'Broadwater', 'Cleveleys border', 'Preesall'],
    time: 'around 80–100 minutes',
    distance: 'approximately 65 miles',
    keywords: ['Fleetwood to Manchester Airport taxi', 'Fleetwood airport transfer', 'Manchester Airport transfer Fleetwood']
  },
  'thornton-cleveleys-manchester-airport-transfer': {
    title: 'Thornton-Cleveleys to Manchester Airport Transfers',
    meta: 'Premium Thornton-Cleveleys to Manchester Airport transfers with EV Exec. Fixed prices, professional service and Tesla Model Y comfort.',
    from: 'Thornton-Cleveleys',
    airport: 'Manchester Airport',
    areas: ['Thornton', 'Cleveleys', 'Norcross', 'Anchorsholme', 'Little Thornton'],
    time: 'around 75–95 minutes',
    distance: 'approximately 60 miles',
    keywords: ['Cleveleys to Manchester Airport taxi', 'Thornton airport transfer', 'Manchester Airport transfer Cleveleys']
  },
  'tesla-airport-transfer-blackpool': {
    title: 'Tesla Airport Transfers Blackpool',
    meta: 'Book a premium Tesla airport transfer from Blackpool with EV Exec. Quiet electric comfort, fixed prices, flight monitoring and professional service.',
    from: 'Blackpool and the Fylde Coast',
    airport: 'UK airports including Manchester and Liverpool',
    areas: ['Blackpool', 'Lytham St Annes', 'Poulton-le-Fylde', 'Fleetwood', 'Thornton-Cleveleys'],
    time: 'planned around your flight time',
    distance: 'quoted based on your journey',
    keywords: ['Tesla airport transfer Blackpool', 'EV airport transfer Blackpool', 'premium Tesla taxi Blackpool']
  },
  'executive-airport-transfer-fylde-coast': {
    title: 'Executive Airport Transfers Fylde Coast',
    meta: 'Executive airport transfers across the Fylde Coast with EV Exec. Premium Tesla travel for business travellers, families and frequent flyers.',
    from: 'the Fylde Coast',
    airport: 'Manchester, Liverpool and other UK airports',
    areas: ['Blackpool', 'Lytham St Annes', 'Poulton-le-Fylde', 'Fleetwood', 'Thornton-Cleveleys', 'Wrea Green'],
    time: 'planned around your collection and flight time',
    distance: 'quoted based on your journey',
    keywords: ['executive airport transfer Fylde Coast', 'premium airport transfer Blackpool', 'business airport transfer Fylde']
  },
  'corporate-airport-transfers-fylde-coast': {
    title: 'Corporate Airport Transfers Fylde Coast',
    meta: 'Corporate airport transfers for Fylde Coast businesses. EV Exec provides reliable Tesla airport transfers with professional service and fixed pricing.',
    from: 'the Fylde Coast',
    airport: 'Manchester, Liverpool and other UK airports',
    areas: ['Blackpool', 'Lytham', 'St Annes', 'Poulton-le-Fylde', 'Fleetwood', 'Thornton-Cleveleys'],
    time: 'scheduled around your meeting, flight or itinerary',
    distance: 'quoted based on your journey',
    keywords: ['corporate airport transfers Fylde Coast', 'business airport transfer Blackpool', 'executive travel Fylde Coast']
  }
};

export async function getStaticPaths() {
  return {
    paths: Object.keys(pages).map((slug) => ({ params: { slug } })),
    fallback: false
  };
}

export async function getStaticProps({ params }) {
  return { props: { page: pages[params.slug], slug: params.slug } };
}

export default function LandingPage({ page, slug }) {
  const url = `${SITE_URL}/${slug}`;
  const faq = [
    {
      q: `Do you offer ${page.from} to ${page.airport} transfers?`,
      a: `Yes. EV Exec provides premium door-to-door airport transfers from ${page.from} to ${page.airport}, with fixed pricing and professional service.`
    },
    {
      q: 'Do you monitor flights?',
      a: 'Yes. Airport transfers include flight monitoring where flight details are provided, helping us plan collection times around early arrivals or delays.'
    },
    {
      q: 'Can I book a return airport transfer?',
      a: 'Yes. One-way and return airport transfers are available. Return bookings are ideal for holidays, business travel and regular airport journeys.'
    },
    {
      q: 'What vehicle does EV Exec use?',
      a: 'EV Exec operates a premium Tesla Model Y, offering a quiet cabin, comfortable seating and a more refined airport transfer experience.'
    }
  ];

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'EV Exec',
    url: SITE_URL,
    telephone: PHONE,
    email: EMAIL,
    areaServed: page.areas,
    priceRange: '££',
    description: page.meta,
    makesOffer: {
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: page.title,
        serviceType: 'Airport transfer service'
      }
    }
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };

  return (
    <>
      <Head>
        <title>{page.title} | EV Exec</title>
        <meta name="description" content={page.meta} />
        <meta name="keywords" content={page.keywords.join(', ')} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={`${page.title} | EV Exec`} />
        <meta property="og:description" content={page.meta} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </Head>

      <main className="seo-page">
        <header className="hero">
          <nav className="nav">
            <Link href="/" className="brand">EV Exec</Link>
            <div>
              <Link href="/booking" className="navLink">Book Online</Link>
              <a href={`tel:${PHONE.replace(/\s/g, '')}`} className="navButton">Call {PHONE}</a>
            </div>
          </nav>

          <section className="heroGrid">
            <div>
              <p className="eyebrow">Premium Tesla airport transfers</p>
              <h1>{page.title}</h1>
              <p className="lead">EV Exec provides reliable, fixed-price airport transfers from {page.from} to {page.airport}. Travel in a premium Tesla Model Y with flight monitoring, door-to-door service and a calm, professional experience from start to finish.</p>
              <div className="actions">
                <Link href="/booking" className="primary">Get a Fixed Quote</Link>
                <a href={`mailto:${EMAIL}`} className="secondary">Email {EMAIL}</a>
              </div>
            </div>
            <aside className="quoteCard">
              <h2>Journey overview</h2>
              <p><strong>Pickup area:</strong> {page.from}</p>
              <p><strong>Airport:</strong> {page.airport}</p>
              <p><strong>Journey time:</strong> {page.time}</p>
              <p><strong>Distance:</strong> {page.distance}</p>
              <p><strong>Vehicle:</strong> Tesla Model Y</p>
            </aside>
          </section>
        </header>

        <section className="section">
          <h2>Why book with EV Exec?</h2>
          <div className="cards">
            <div><h3>Fixed pricing</h3><p>No uncertainty. Get a clear airport transfer quote before you travel.</p></div>
            <div><h3>Flight monitoring</h3><p>We track your flight details when supplied, helping reduce stress around delays and arrivals.</p></div>
            <div><h3>Tesla comfort</h3><p>Quiet electric travel in a premium Tesla Model Y with space for passengers and luggage.</p></div>
            <div><h3>Professional service</h3><p>A reliable local airport transfer service focused on quality, punctuality and care.</p></div>
          </div>
        </section>

        <section className="section split">
          <div>
            <h2>Popular pickup areas</h2>
            <p>EV Exec covers {page.from} and nearby areas for airport transfers, including:</p>
            <ul>{page.areas.map((area) => <li key={area}>{area}</li>)}</ul>
          </div>
          <div>
            <h2>Built for airport travel</h2>
            <p>Whether you are travelling for a family holiday, business trip, cruise connection or long-haul flight, EV Exec gives you a more polished alternative to a standard taxi.</p>
            <p>Book in advance, receive a fixed quote and enjoy a smoother journey to the airport.</p>
          </div>
        </section>

        <section className="section faq">
          <h2>Frequently asked questions</h2>
          {faq.map((item) => (
            <details key={item.q} open>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </section>

        <section className="cta">
          <h2>Book your {page.airport} transfer</h2>
          <p>Contact EV Exec today for a fixed airport transfer quote from {page.from}.</p>
          <div className="actions centre">
            <Link href="/booking" className="primary">Book Online</Link>
            <a href={`tel:${PHONE.replace(/\s/g, '')}`} className="secondary">Call {PHONE}</a>
          </div>
        </section>
      </main>

      <style jsx>{`
        .seo-page { background:#06111f; color:#f8fafc; min-height:100vh; font-family:Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .hero { padding:28px 20px 70px; background:radial-gradient(circle at 75% 20%, rgba(201,165,91,.22), transparent 30%), linear-gradient(135deg,#020617,#0b1628 55%,#111827); }
        .nav { max-width:1120px; margin:0 auto 70px; display:flex; justify-content:space-between; align-items:center; gap:18px; }
        .brand { color:#f8fafc; text-decoration:none; font-weight:800; font-size:24px; letter-spacing:.02em; }
        .navLink { color:#cbd5e1; text-decoration:none; margin-right:18px; }
        .navButton,.primary { background:#c9a55b; color:#08111f; text-decoration:none; font-weight:800; padding:13px 18px; border-radius:999px; display:inline-block; }
        .heroGrid,.section,.cta { max-width:1120px; margin:0 auto; }
        .heroGrid { display:grid; grid-template-columns:1.4fr .8fr; gap:36px; align-items:center; }
        .eyebrow { color:#c9a55b; text-transform:uppercase; letter-spacing:.16em; font-size:13px; font-weight:800; }
        h1 { font-size:clamp(42px, 7vw, 76px); line-height:.95; letter-spacing:-.05em; margin:0 0 24px; }
        h2 { font-size:clamp(28px, 4vw, 42px); letter-spacing:-.035em; margin:0 0 20px; }
        h3 { margin:0 0 8px; font-size:20px; }
        .lead { color:#dbe4ef; font-size:20px; line-height:1.65; max-width:780px; }
        .actions { display:flex; flex-wrap:wrap; gap:14px; margin-top:28px; align-items:center; }
        .secondary { color:#f8fafc; border:1px solid rgba(255,255,255,.22); text-decoration:none; padding:13px 18px; border-radius:999px; display:inline-block; }
        .quoteCard { background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); border-radius:28px; padding:28px; box-shadow:0 30px 80px rgba(0,0,0,.25); }
        .quoteCard p { color:#dbe4ef; line-height:1.6; }
        .section { padding:72px 20px; }
        .cards { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; }
        .cards div,.faq details { background:#0f1b2d; border:1px solid rgba(255,255,255,.09); border-radius:22px; padding:24px; }
        .cards p,.section p,.faq p,li { color:#cbd5e1; line-height:1.7; }
        .split { display:grid; grid-template-columns:1fr 1fr; gap:44px; }
        ul { padding-left:20px; }
        .faq details { margin-bottom:14px; }
        summary { cursor:pointer; font-weight:800; font-size:18px; }
        .cta { text-align:center; padding:70px 20px 90px; }
        .centre { justify-content:center; }
        @media (max-width: 800px) { .heroGrid,.split,.cards { grid-template-columns:1fr; } .nav { align-items:flex-start; } .navLink { display:none; } }
      `}</style>
    </>
  );
}
