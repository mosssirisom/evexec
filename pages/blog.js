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
      </Head>

      <main className="min-h-screen bg-[#020813] text-white">
        <section className="mx-auto max-w-6xl px-6 py-8 md:py-12">
          <header className="flex items-center justify-between border-b border-white/10 pb-6">
            <a href="/" className="flex items-center gap-4" aria-label="EV Exec home">
              <img src="/favicon.ico" alt="EV Exec" className="h-14 w-14 rounded-full" />
              <div>
                <p className="text-3xl font-black tracking-[0.18em]">EV EXEC</p>
                <p className="text-xs uppercase tracking-[0.35em] text-white/55">Premium Airport Transfers</p>
              </div>
            </a>
            <a href="/" className="rounded-2xl border border-[#d4a72c] px-5 py-3 text-sm font800 text-[#f1c75b] hover:bg-[#d4a72c]/10">← Home</a>
          </header>

          <section className="py-14 md:py-20">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.32em] text-[#f1c75b]">EV Exec Blog</p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight md:text-6xl">Airport transfer advice for Blackpool, Fylde & Wyre travellers.</h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">Guides, travel tips and local airport transfer advice from EV Exec — helping customers plan reliable, fixed-price journeys to Manchester, Liverpool, Leeds Bradford, Birmingham, Newcastle and other major UK airports.</p>
          </section>

          <section className="grid gap-6 md:grid-cols-3">
            {posts.map((post) => (
              <a key={post.title} href={post.href} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 transition hover:border-[#d4a72c]/70 hover:bg-white/[0.06]">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#f1c75b]">{post.date}</p>
                <h2 className="text-2xl font-black leading-tight">{post.title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/65">{post.description}</p>
              </a>
            ))}
          </section>

          <article id="blackpool-to-manchester-airport-transfers" className="mt-14 rounded-[2rem] border border-white/10 bg-white/[0.035] p-7 md:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#f1c75b]">EV Exec Guide</p>
            <h2 className="mt-4 text-3xl font-black md:text-4xl">Blackpool to Manchester Airport Transfers: What to Expect from EV Exec</h2>
            <p className="mt-6 leading-8 text-white/70">A good airport transfer should feel calm from the moment it is booked. EV Exec provides fixed-price airport transfers from Blackpool, Fylde and Wyre, with clear communication, live flight awareness and a premium electric vehicle experience.</p>
            <p className="mt-4 leading-8 text-white/70">For Manchester Airport journeys, customers benefit from pre-booked collection times, luggage-friendly planning and a professional owner-operated approach. The goal is simple: arrive relaxed, on time and without last-minute transport stress.</p>
          </article>

          <article id="fixed-price-airport-transfers" className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-7 md:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#f1c75b]">Travel Advice</p>
            <h2 className="mt-4 text-3xl font-black md:text-4xl">Why Fixed-Price Airport Transfers Beat Last-Minute Taxi Stress</h2>
            <p className="mt-6 leading-8 text-white/70">Fixed pricing gives customers confidence before they travel. Instead of wondering about changing fares or availability, the journey is planned in advance with one agreed price and one clear booking.</p>
            <p className="mt-4 leading-8 text-white/70">This is especially valuable for early morning departures, family holidays, business travel and airport returns where timing and reliability matter.</p>
          </article>

          <article id="family-airport-transfers" className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-7 md:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-[#f1c75b]">Family Travel</p>
            <h2 className="mt-4 text-3xl font-black md:text-4xl">Travelling with Family: Choosing a Premium Airport Transfer</h2>
            <p className="mt-6 leading-8 text-white/70">Family airport travel often means luggage, timing pressure and the need for clear communication. A pre-booked airport transfer helps keep the day structured and easier to manage.</p>
            <p className="mt-4 leading-8 text-white/70">EV Exec focuses on comfort, reliable collection, clean presentation and straightforward booking, making it suitable for holidays, special trips and return journeys from major UK airports.</p>
          </article>

          <section className="mt-12 rounded-[2rem] border border-[#d4a72c]/40 bg-[#d4a72c]/10 p-7 md:p-10">
            <h2 className="text-3xl font-black">Need an airport transfer?</h2>
            <p className="mt-4 max-w-2xl leading-8 text-white/70">Book a fixed-price EV Exec airport transfer from Blackpool, Fylde or Wyre.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a href="/#booking" className="rounded-2xl bg-gradient-to-r from-[#f5cf69] to-[#b8860b] px-6 py-4 text-center font-black text-[#05101f]">Book Now</a>
              <a href="https://wa.me/447721070370" className="rounded-2xl border border-[#d4a72c] px-6 py-4 text-center font-black text-white">Message on WhatsApp</a>
            </div>
          </section>
        </section>
      </main>
    </>
  );
}
