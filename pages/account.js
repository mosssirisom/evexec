import { useEffect, useState } from 'react';

function getToken() {
  if (typeof window === 'undefined') return '';

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      if (
        key.includes('supabase') ||
        key.includes('auth-token') ||
        key.includes('sb-')
      ) {
        try {
          const parsed = JSON.parse(raw);

          const token =
            parsed?.access_token ||
            parsed?.currentSession?.access_token ||
            parsed?.session?.access_token ||
            parsed?.currentSession?.session?.access_token ||
            parsed?.data?.session?.access_token ||
            parsed?.user?.aud;

          if (token && token.length > 20) return token;
        } catch {}
      }
    }
  } catch {}

  return '';
}

export default function Account() {
  const [tab, setTab] = useState('dash');
  const [profile, setProfile] = useState({});
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAccount() {
    try {
      setLoading(true);
      setError('');

      const token = getToken();

      if (!token) {
        setError('Please sign in again');
        setLoading(false);
        return;
      }

      const headers = {
        Authorization: `Bearer ${token}`
      };

      const profileReq = await fetch('/api/account/profile', { headers });
      const journeysReq = await fetch('/api/account/journeys', { headers });

      if (!profileReq.ok) {
        throw new Error('Please sign in again');
      }

      const profileData = await profileReq.json();
      const journeysData = journeysReq.ok ? await journeysReq.json() : { journeys: [] };

      setProfile(profileData.profile || {});
      setJourneys(journeysData.journeys || []);
    } catch (e) {
      setError(e.message || 'Account unavailable');
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAccount();
  }, []);

  const pts = profile.privilege_points || 0;
  const email = profile.email || '';
  const name = profile.full_name || profile.name || email || 'EV Exec Customer';
  const completed = journeys.filter(j => j.status === 'Completed').length;
  const tier = pts >= 20 ? 'Executive' : pts >= 10 ? 'Preferred' : 'Client';

  return (
    <main style={{ minHeight: '100vh', background: '#020813', color: 'white', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
        <div>
          <div style={{ color: '#d5a538', fontWeight: 900, letterSpacing: '.25em' }}>EV EXEC</div>
          <div style={{ opacity: .5, letterSpacing: '.3em', fontSize: 12 }}>MY ACCOUNT</div>
        </div>

        {!error && (
          <button
            onClick={() => {
              localStorage.clear();
              location.href = '/';
            }}
            style={{ borderRadius: 999, padding: '12px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,.2)', color: 'white' }}
          >
            Sign Out
          </button>
        )}
      </div>

      {loading && <div>Loading...</div>}

      {!loading && error && (
        <div style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, padding: 40, textAlign: 'center', background: 'rgba(255,255,255,.05)' }}>
          <h1>My Account</h1>
          <p style={{ opacity: .7 }}>{error}</p>
          <a href="/#account" style={{ display: 'inline-block', marginTop: 12, background: '#d5a538', color: '#000', padding: '14px 24px', borderRadius: 20, fontWeight: 800 }}>
            Sign In
          </a>
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 28, padding: 24, background: 'rgba(255,255,255,.05)' }}>
            <div style={{ opacity: .5, textTransform: 'uppercase', letterSpacing: '.2em', fontSize: 12 }}>Welcome back</div>
            <h1 style={{ fontSize: 52, marginBottom: 10 }}>{name}</h1>
            <p style={{ opacity: .6 }}>{email}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 20 }}>
              <div style={{ padding: 20, borderRadius: 20, background: 'rgba(255,255,255,.05)' }}>
                <div style={{ color: '#d5a538', fontSize: 34, fontWeight: 800 }}>{completed * 12}kg</div>
                <div style={{ opacity: .6 }}>CO₂ Saved</div>
              </div>

              <div style={{ padding: 20, borderRadius: 20, background: 'rgba(255,255,255,.05)' }}>
                <div style={{ fontSize: 34, fontWeight: 800 }}>{journeys.length}</div>
                <div style={{ opacity: .6 }}>Trips</div>
              </div>

              <div style={{ padding: 20, borderRadius: 20, background: 'rgba(255,255,255,.05)' }}>
                <div style={{ fontSize: 34, fontWeight: 800 }}>{pts}</div>
                <div style={{ opacity: .6 }}>{tier}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
