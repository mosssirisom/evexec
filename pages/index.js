import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    window.location.replace('/index.html');
  }, []);

  return (
    <main style={{ minHeight: '100vh', background: '#020813', color: '#ffffff', display: 'grid', placeItems: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <h1>EV Exec</h1>
        <p>Loading premium airport transfers...</p>
      </div>
    </main>
  );
}
