import {useEffect,useState}from'react';

function findToken(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const raw=localStorage.getItem(localStorage.key(i))||'';
      try{
        const o=JSON.parse(raw);
        const t=o.access_token||o.session?.access_token||o.currentSession?.access_token||o.data?.session?.access_token;
        if(t)return t;
      }catch{}
    }
  }catch{}
  return '';
}

export default function Account(){
  const[tab,setTab]=useState('dash');
  const[p,setP]=useState({});
  const[j,setJ]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  useEffect(()=>{(async()=>{
    const t=findToken();
    if(!t){setError('Please sign in again');setLoading(false);return}
    try{
      const h={Authorization:'Bearer '+t};
      const a=await fetch('/api/account/profile',{headers:h});
      const b=await fetch('/api/account/journeys',{headers:h});
      if(!a.ok)throw Error('Please sign in again');
      const ap=await a.json();
      const bp=b.ok?await b.json():{journeys:[]};
      setP(ap.profile||{});setJ(bp.journeys||[]);
    }catch(e){setError(e.message||'Please sign in again')}
    setLoading(false);
  })()},[]);

  const pts=p.privilege_points||0;
  const email=p.email||'';
  const name=p.full_name||p.name||email||'EV Exec Customer';
  const tier=pts>=20?'Executive':pts>=10?'Preferred':'Client';
  const done=j.filter(x=>String(x.status).toLowerCase()==='completed').length;
  const nav=[['dash','⌂','Dashboard'],['trips','↺','Journey\nHistory'],['rew','☆','Rewards'],['acct','♙','Account']];

  return <main><style>{`
    html,body,#__next{margin:0;min-height:100%;background:#020813}*{box-sizing:border-box}main{min-height:100vh;background:radial-gradient(circle at 80% 10%,rgba(30,67,116,.22),transparent 32%),radial-gradient(circle at 84% 82%,rgba(213,165,56,.12),transparent 25%),#020813;color:white;font-family:Inter,Arial,sans-serif;padding-bottom:126px}.head{position:sticky;top:0;z-index:2;height:118px;background:rgba(2,8,19,.94);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;padding:24px 28px}.brand{display:flex;gap:18px;align-items:center}.logo{width:58px;height:58px;border-radius:15px;background:#050b15;color:#d5a538;display:grid;place-items:center;font:800 36px Georgia}.bt{font-size:23px;font-weight:900;letter-spacing:.32em}.bs{font-size:13px;letter-spacing:.33em;color:rgba(255,255,255,.45)}.out{border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);padding:13px 21px;font-weight:900;font-size:16px}.wrap{max-width:760px;margin:0 auto;padding:28px 26px}.card,.panel,.reward{background:linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);border-radius:32px;box-shadow:0 24px 70px rgba(0,0,0,.35)}.hero{padding:34px 36px;margin-bottom:34px}.name{font-size:50px;line-height:1;margin:0 0 22px;font-weight:900}.muted{color:rgba(255,255,255,.56)}.gold{color:#d5a538}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:17px;margin-top:34px}.stat{text-align:center;min-height:126px;border-radius:24px;padding:27px 8px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12)}.stat b{display:block;font-size:34px}.stat span{font-size:21px;color:rgba(255,255,255,.55)}.list{overflow:hidden}.tile{display:flex;align-items:center;gap:24px;padding:31px;border-bottom:1px solid rgba(255,255,255,.08)}.tile:last-child{border:0}.ico{width:66px;height:66px;border-radius:21px;display:grid;place-items:center;background:rgba(213,165,56,.10);color:#d5a538;font-size:31px}.tile h2{font-size:33px;margin:0 0 7px}.tile p{font-size:22px;margin:0;color:rgba(255,255,255,.55)}.mini{font-size:16px;letter-spacing:.34em;text-transform:uppercase;color:rgba(255,255,255,.45);font-weight:900}.reward{position:relative;padding:44px 36px;border-color:rgba(213,165,56,.34)}.orb{position:absolute;right:36px;top:48px;width:134px;height:134px;border-radius:50%;border:1px solid rgba(213,165,56,.42);display:grid;place-items:center;text-align:center}.orb b{font-size:56px}.tier{font-size:64px;margin:35px 0 20px;line-height:.9}.reward p,.benefits{font-size:23px;line-height:1.55}.bar{height:14px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#f2c66d,#d5a538)}.panel{padding:38px 36px}.panel h1{font-size:42px;margin:0 0 28px}.inner{border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.13);padding:34px;margin-top:22px}.empty{min-height:430px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}.empty h2{font-size:41px}.input{width:100%;height:58px;border-radius:18px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.055);color:white;padding:0 20px}.btn{border:0;border-radius:22px;padding:17px 25px;background:linear-gradient(135deg,#f2c66d,#d5a538);font-weight:900}.fab{position:fixed;right:32px;bottom:118px;width:91px;height:91px;border-radius:50%;border:0;background:linear-gradient(135deg,#f6cf78,#d5a538);font-size:38px}.bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(2,8,19,.95);border-top:1px solid rgba(255,255,255,.1);display:grid;grid-template-columns:repeat(4,1fr);padding:13px 8px calc(13px + env(safe-area-inset-bottom))}.bottom button{background:0;border:0;color:rgba(255,255,255,.55);font-weight:900;font-size:14px;white-space:pre-line}.bottom .on{color:#d5a538}.auth{text-align:center;padding:46px 34px;margin-top:100px}.auth h1{font-size:44px}.load{text-align:center;margin-top:90px;color:rgba(255,255,255,.6)}@media(max-width:520px){.wrap{padding:28px 16px}.hero{padding:30px 20px}.name{font-size:42px}.stats{gap:12px}.stat b{font-size:31px}.tile h2{font-size:29px}.reward,.panel{padding:36px 28px}.orb{width:108px;height:108px;right:28px}.tier{font-size:58px}}
  `}</style><header className="head"><div className="brand"><div className="logo">E</div><div><div className="bt">EV EXEC</div><div className="bs">MY ACCOUNT</div></div></div>{!error&&<button className="out" onClick={()=>{location.href='/#account'}}>Sign Out</button>}</header><div className="wrap">{loading&&<div className="load">Loading account…</div>}{!loading&&error&&<div className="auth card"><h1>My Account</h1><p className="muted">{error}</p><a className="btn" href="/#account">Sign In</a></div>}{!loading&&!error&&tab==='dash'&&<><section className="card hero"><h1 className="name">{name}</h1><p className="muted" style={{fontSize:22}}>{email}</p><div className="stats"><div className="stat"><b className="gold">{done*12}kg</b><span>CO2<br/>Saved</span></div><div className="stat"><b>{j.length}</b><span>Trips</span></div><div className="stat"><b>-</b><span>Rating</span></div></div></section><section className="card list"><div className="tile" onClick={()=>setTab('trips')}><div className="ico">▣</div><div><h2>Upcoming Rides</h2><p>No Upcoming Rides</p></div></div><div className="tile" onClick={()=>setTab('rew')}><div className="ico">☆</div><div><h2 className="gold">Privilege Points</h2><p>{pts} pts · {tier} Tier</p></div></div></section></>}{!loading&&!error&&tab==='rew'&&<><section className="reward"><div className="orb"><div><b>{pts}</b><br/><span className="gold">PTS</span></div></div><div className="mini">Current Status</div><h1 className="tier">{tier}</h1><p><span className="gold">EV EXEC</span> Privilege Member</p><p className="muted">{Math.max(0,(pts>=10?20:10)-pts)} more points to reach <span className="gold">{pts>=10?'Executive':'Preferred'}</span></p><div className="bar"><span style={{width:Math.min(100,pts*10)+'%'}}/></div></section><br/><section className="panel"><div className="mini">Client Benefits</div><p className="muted benefits">Premium EV experience on every journey<br/>Fixed-price fares — no surge pricing<br/>100% zero-emission Tesla Model Y</p></section></>}{!loading&&!error&&tab==='trips'&&<section className="panel"><div className="mini">Journey History</div><h1>Your Trips</h1><div className="inner empty"><div className="ico">⌁</div><h2>{j.length?'Your journeys':'No journeys yet'}</h2><p className="muted">Your completed transfers and invoices will appear here automatically.</p></div></section>}{!loading&&!error&&tab==='acct'&&<section className="panel"><h1>Account</h1><div className="inner"><b>Email</b><p className="muted" style={{fontSize:23}}>{email}</p></div><div className="inner"><b>Change Password</b><br/><br/><input className="input" placeholder="New password"/><br/><br/><input className="input" placeholder="Confirm password"/><br/><br/><button className="btn">Update Password</button></div></section>}</div>{!error&&<button className="fab">□</button>}{!error&&<nav className="bottom">{nav.map(n=><button key={n[0]} className={tab===n[0]?'on':''} onClick={()=>setTab(n[0])}><div>{n[1]}</div>{n[2]}</button>)}</nav>}</main>
}
