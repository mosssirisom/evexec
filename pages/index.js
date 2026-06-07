import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>EV Exec</title>
        <meta name="description" content="EV Exec premium airport transfers." />
      </Head>
      <main style={{ minHeight: '100vh', background: '#020813', color: '#ffffff', display: 'grid', placeItems: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1>EV Exec</h1>
          <p>Premium airport transfers.</p>
        </div>
      </main>
    </>
  );
}
