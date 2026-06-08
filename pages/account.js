import { useEffect, useState } from 'react';

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const profileRes = await fetch('/api/account/profile');
        if (!profileRes.ok) throw new Error('Please sign in again');
        const profileData = await profileRes.json();
        setProfile(profileData.profile || null);

        const journeysRes = await fetch('/api/account/journeys');
        if (journeysRes.ok) {
          const journeysData = await journeysRes.json();
          setJourneys(journeysData.journeys || []);
        }
      } catch (err) {
        setError(err.message || 'Failed to load account');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <main style={{minHeight:'100vh',background:'#020813',color:'#fff',padding:'32px',fontFamily:'Inter,sans-serif'}}>
      <div style={{maxWidth:'1100px',margin:'0 auto'}}>
        <h1 style={{fontSize:'42px',marginBottom:'8px'}}>My Account</h1>
        <p style={{opacity:.7,marginBottom:'32px'}}>EV Exec customer dashboard</p>

        {loading && <p>Loading account...</p>}

        {error && (
          <div style={{background:'#1b2333',border:'1px solid #d5a538',padding:'16px',borderRadius:'16px'}}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section style={{background:'#0b1524',padding:'24px',borderRadius:'24px',marginBottom:'24px'}}>
              <h2 style={{marginBottom:'12px'}}>Profile</h2>
              <p>{profile?.full_name || 'EV Exec Customer'}</p>
              <p>{profile?.phone || ''}</p>
            </section>

            <section style={{background:'#0b1524',padding:'24px',borderRadius:'24px'}}>
              <h2 style={{marginBottom:'16px'}}>Your Trips</h2>

              {journeys.length === 0 && (
                <p style={{opacity:.7}}>No journeys found yet.</p>
              )}

              {journeys.map((journey) => (
                <div key={journey.id} style={{padding:'18px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:'16px'}}>
                    <strong>{journey.airport || 'Airport Transfer'}</strong>
                    <span>{journey.customer_status || journey.status}</span>
                  </div>
                  <p style={{opacity:.8,marginTop:'8px'}}>
                    {journey.travel_date} {journey.travel_time}
                  </p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
