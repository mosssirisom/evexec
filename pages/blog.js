import Head from 'next/head';

const posts = [
  {
    title: 'Blackpool to Manchester Airport Transfers: What to Expect from EV Exec',
    description: 'A practical guide for travellers booking a fixed-price, premium airport transfer from Blackpool, Fylde and Wyre to Manchester Airport.',
    href: '#blackpool-to-manchester-airport-transfers',
    date: 'EV Exec Guide'
  },
  {
    title: 'Why Fixed-Price Airport Transfers Beat Last-Minute Taxi Stress',
    description: 'How fixed pricing, flight monitoring and pre-booked travel remove uncertainty from airport journeys.',
    href: '#fixed-price-airport-transfers',
    date: 'Travel Advice'
  },
  {
    title: 'Travelling with Family: Choosing a Premium Airport Transfer',
    description: 'Comfort, luggage space, clear communication and reliable timing for family airport travel.',
    href: '#family-airport-transfers',
    date: 'Family Travel'
  }
];

export default function Blog() {
  return (
    <>
      <Head>
        <title>EV Exec Blog | Airport Transfer Advice Blackpool, Fylde & Wyre</title>
        <meta name="description" content="EV Exec airport transfer advice, travel guides and premium private hire tips for Blackpool, Fylde, Wyre, Manchester Airport, Liverpool Airport and major UK airports." />
        <meta name="keywords" content="EV Exec blog, Blackpool airport transfers, Manchester Airport transfer Blackpool, airport transfer advice, Fylde airport transfer, Wyre airport transfer" />
        <link rel="canonical" href="https://evexec.co.uk/blog" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </Head>

      <main className="ev-blog">
        <style jsx global>{`
          html, body { margin: 0; background: #020813; }
          .ev-blog { min-height: 100vh; color: #fff; background: radial-gradient(circle at 80% 10%, rgba(212,167,44,.18), transparent 28%), radial-gradient(circle at 10% 0%, rgba(40,92,160,.16), transparent 30%), linear-gradient(180deg, #020813 0%, #050b16 48%, #020813 100%); font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
          .ev-wrap { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 32px 0 56px; }
          .ev-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 0; border-bottom: 1px solid rgba(255,255,255,.11); }
          .ev-brand { display: flex; align-items: center; gap: 16px; color: #fff; text-decoration: none; }
          .ev-logo { width: 64px; height: 64px; border-radius: 999px; border: 1px solid rgba(245,207,105,.34); box-shadow: 0 18px 50px rgba(0,0,0,.35); object-fit: cover; }
          .ev-name { font-size: clamp(30px, 5vw, 46px); line-height: .92; margin: 0; letter-spacing: .15em; font-weight: 900; }
          .ev-sub { margin: 8px 0 0; color: rgba(255,255,255,.58); text-transform: uppercase; letter-spacing: .34em; font-size: 12px; }
          .ev-home { color: #f1c75b; text-decoration: none; border: 1px solid rgba(212,167,44,.8); border-radius: 18px; padding: 13px 18px; font-weight: 800; background: rgba(255,255,255,.03); box-shadow: inset 0 1px 0 rgba(255,255,255,.07); white-space: nowrap; }
          .ev-home:hover { background: rgba(212,167,44,.12); }
          .ev-hero { padding: 72px 0 44px; }
          .ev-kicker { color: #f1c75b; text-transform: uppercase; letter-spacing: .32em; font-size: 13px; font-weight: 900; margin: 0 0 18px; }
          .ev-title { font-size: clamp(42px, 7vw, 78px); line-height: .98; max-width: 930px; margin: 0; font-weight: 900; letter-spacing: -.045em; }
          .ev-title span { display: block; color: #f1c75b; }
          .ev-intro { max-width: 760px; color: rgba(255,255,255,.7); font-size: 18px; line-height: 1.8; margin: 28px 0 0; }
          .ev-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 18px 0 56px; }
          .ev-card { color: #fff; text-decoration: none; border: 1px solid rgba(255,255,255,.12); background: linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035)); border-radius: 30px; padding: 26px; box-shadow: 0 30px 80px rgba(0,0,0,.28); min-height: 210px; }
          .ev-card:hover { border-color: rgba(241,199,91,.72); transform: translateY(-1px); }
          .ev-card-date, .ev-article-kicker { color: #f1c75b; font-size: 12px; text-transform: uppercase; letter-spacing: .22em; font-weight: 900; margin: 0 0 16px; }
          .ev-card h2 { margin: 0; font-size: 24px; line-height: 1.12; letter-spacing: -.02em; }
          .ev-card p:last-child { color: rgba(255,255,255,.65); line-height: 1.65; margin: 18px 0 0; }
          .ev-article { margin-top: 24px; border: 1px solid rgba(255,255,255,.12); border-radius: 34px; background: rgba(255,255,255,.045); padding: clamp(26px, 5vw, 46px); box-shadow: 0 24px 80px rgba(0,0,0,.24); }
          .ev-article h2 { font-size: clamp(30px, 4vw, 46px); line-height: 1.08; margin: 0; letter-spacing: -.035em; }
          .ev-article p:not(.ev-article-kicker) { color: rgba(255,255,255,.72); line-height: 1.85; font-size: 17px; margin: 20px 0 0; }
          .ev-cta { margin-top: 34px; border: 1px solid rgba(212,167,44,.48); border-radius: 34px; background: linear-gradient(135deg, rgba(212,167,44,.18), rgba(255,255,255,.035)); padding: clamp(28px, 5vw, 46px); }
          .ev-cta h2 { margin: 0; font-size: clamp(30px, 4vw, 44px); }
          .ev-cta p { color: rgba(255,255,255,.72); line-height: 1.75; font-size: 17px; }
          .ev-actions { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 24px; }
          .ev-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 170px; border-radius: 18px; padding: 16px 22px; font-weight: 900; text-decoration: none; }
          .ev-btn.gold { color: #07101d; background: linear-gradient(135deg, #f7d36b, #b8860b); box-shadow: 0 16px 45px rgba(212,167,44,.22); }
          .ev-btn.outline { color: #fff; border: 1px solid rgba(212,167,44,.86); background: rgba(2,8,19,.35); }
          @media (max-width: 820px) { .ev-header { align-items: flex-start; } .ev-cards { grid-template-columns: 1fr; } .ev-name { font-size: 30px; } .ev-sub { letter-spacing: .18em; } .ev-home { padding: 11px 14px; } }
        `}</style>

        <section className="ev-wrap">
          <header className="ev-header">
            <a href="/" className="ev-brand" aria-label="EV Exec home">
              <img src="/favicon.ico" alt="EV Exec" className="ev-logo" />
              <div>
                <p className="ev-name">EV EXEC</p>
                <p className="ev-sub">Premium Airport Transfers</p>
              </div>
            </a>
            <a href="/" className="ev-home">← Home</a>
          </header>

          <section className="ev-hero">
            <p className="ev-kicker">EV Exec Blog</p>
            <h1 className="ev-title">Airport transfer advice for <span>Blackpool, Fylde & Wyre.</span></h1>
            <p className="ev-intro">Guides, travel tips and local airport transfer advice from EV Exec — helping customers plan reliable, fixed-price journeys to Manchester, Liverpool, Leeds Bradford, Birmingham, Newcastle and other major UK airports.</p>
          </section>

          <section className="ev-cards">
            {posts.map((post) => (
              <a key={post.title} href={post.href} className="ev-card">
                <p className="ev-card-date">{post.date}</p>
                <h2>{post.title}</h2>
                <p>{post.description}</p>
              </a>
            ))}
          </section>

          <article id="blackpool-to-manchester-airport-transfers" className="ev-article">
            <p className="ev-article-kicker">EV Exec Guide</p>
            <h2>Blackpool to Manchester Airport Transfers: What to Expect from EV Exec</h2>
            <p>A good airport transfer should feel calm from the moment it is booked. EV Exec provides fixed-price airport transfers from Blackpool, Fylde and Wyre, with clear communication, live flight awareness and a premium electric vehicle experience.</p>
            <p>For Manchester Airport journeys, customers benefit from pre-booked collection times, luggage-friendly planning and a professional owner-operated approach. The goal is simple: arrive relaxed, on time and without last-minute transport stress.</p>
          </article>

          <article id="fixed-price-airport-transfers" className="ev-article">
            <p className="ev-article-kicker">Travel Advice</p>
            <h2>Why Fixed-Price Airport Transfers Beat Last-Minute Taxi Stress</h2>
            <p>Fixed pricing gives customers confidence before they travel. Instead of wondering about changing fares or availability, the journey is planned in advance with one agreed price and one clear booking.</p>
            <p>This is especially valuable for early morning departures, family holidays, business travel and airport returns where timing and reliability matter.</p>
          </article>

          <article id="family-airport-transfers" className="ev-article">
            <p className="ev-article-kicker">Family Travel</p>
            <h2>Travelling with Family: Choosing a Premium Airport Transfer</h2>
            <p>Family airport travel often means luggage, timing pressure and the need for clear communication. A pre-booked airport transfer helps keep the day structured and easier to manage.</p>
            <p>EV Exec focuses on comfort, reliable collection, clean presentation and straightforward booking, making it suitable for holidays, special trips and return journeys from major UK airports.</p>
          </article>

          <section className="ev-cta">
            <h2>Need an airport transfer?</h2>
            <p>Book a fixed-price EV Exec airport transfer from Blackpool, Fylde or Wyre.</p>
            <div className="ev-actions">
              <a href="/#booking" className="ev-btn gold">Book Now</a>
              <a href="https://wa.me/447721070370" className="ev-btn outline">Message on WhatsApp</a>
            </div>
          </section>
        </section>
      </main>
    </>
  );
}
