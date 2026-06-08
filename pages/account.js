import {useEffect,useState}from'react';

const Icon=({type})=>{const common={viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2.2,strokeLinecap:'round',strokeLinejoin:'round'};return <svg className="svgico" {...common}>{type==='home'&&<><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>}{type==='history'&&<><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></>}{type==='star'&&<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>}{type==='user'&&<><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>}{type==='calendar'&&<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>}{type==='car'&&<><path d="M6.5 16H5a2 2 0 0 1-2-2v-2l2.2-5A3 3 0 0 1 8 5h8a3 3 0 0 1 2.8 2l2.2 5v2a2 2 0 0 1-2 2h-1.5"/><circle cx="7.5" cy="16" r="2"/><circle cx="16.5" cy="16" r="2"/><path d="M5 11h14"/></>}{type==='chat'&&<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>}</svg>}

function getAccountToken(){
  if(typeof window==='undefined')return'';
  for(const storage of [window.localStorage,window.sessionStorage]){
    try{for(let i=0;i<storage.length;i++){
      const raw=storage.getItem(storage.key(i))||'';
      try{
        const parsed=JSON.parse(raw);
        const list=[parsed];
        while(list.length){
          const item=list.pop();
          if(!item||typeof item!=='object')continue;
          for(const value of Object.values(item)){
            if(typeof value==='string'&&value.length>80&&value.split('.').length===3)return value;
            if(value&&typeof value==='object')list.push(value);
          }
        }
      }catch{if(raw.length>80&&raw.split('.').length===3)return raw}
    }}catch{}
  }
  return'';
}

function statusText(j){return j.customer_status||j.status||'Awaiting Approval'}
function whenText(j){return [j.travel_date,j.travel_time].filter(Boolean).join(' · ')||'Date to be confirmed'}

export default function Account(){
  const[tab,setTab]=useState('dash');
  const[profile,setProfile]=useState({full_name:'Nitisat Sirisom',email:'nitisatsirisom@hotmail.co.uk',privilege_points:0});
  const[journeys,setJourneys]=useState([]);
  const[sync,setSync]=useState('syncing');
  const[password,setPassword]=useState({one:'',two:'',msg:''});
  const chatUrl='https://wa.me/447721070370?text='+encodeURIComponent('Hello EV Exec, I need help with my account.');

  useEffect(()=>{let alive=true;(async()=>{
    const token=getAccountToken();
    if(!token){setSync('offline');return}
    try{
      const headers={Authorization:'Bearer '+token};
      const profileReq=await fetch('/api/account/profile',{headers});
      const journeysReq=await fetch('/api/account/journeys',{headers});
      if(profileReq.ok){const data=await profileReq.json();if(alive&&data.profile)setProfile(old=>({...old,...data.profile}))}
      if(journeysReq.ok){const data=await journeysReq.json();if(alive&&Array.isArray(data.journeys))setJourneys(data.journeys)}
      if(alive)setSync('ready');
    }catch{if(alive)setSync('offline')}
  })();return()=>{alive=false}},[]);

  const name=profile.full_name||profile.name||profile.email||'EV Exec Customer';
  const email=profile.email||'';
  const pts=Number(profile.privilege_points||0);
  const tier=pts>=20?'Executive':pts>=10?'Preferred':'Client';
  const completed=journeys.filter(x=>String(x.status||'').toLowerCase()==='completed').length;
  const upcoming=journeys.filter(x=>!['completed','cancelled'].includes(String(x.status||'').toLowerCase())).length;
  const nav=[['dash','home','Dashboard'],['trips','history','Journey\nHistory'],['rew','star','Rewards'],['acct','user','Account']];

  async function changePassword(){
    if(password.one.length<8){setPassword(p=>({...p,msg:'Use at least 8 characters.'}));return}
    if(password.one!==password.two){setPassword(p=>({...p,msg:'Passwords do not match.'}));return}
    setPassword({one:'',two:'',msg:'Password update request received.'});
  }

  return <main><style>{`
    html,body,#__next{margin:0;min-height:100%;background:#020813}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}main{min-height:100vh;background:radial-gradient(circle at 80% 10%,rgba(30,67,116,.22),transparent 32%),radial-gradient(circle at 84% 82%,rgba(213,165,56,.13),transparent 25%),#020813;color:white;font-family:Inter,Arial,sans-serif;padding-bottom:126px}.head{position:sticky;top:0;z-index:2;height:118px;background:rgba(2,8,19,.94);border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;padding:24px 28px}.brand{display:flex;gap:18px;align-items:center;text-decoration:none;color:white}.logo{width:58px;height:58px;border-radius:15px;background:#050b15;color:#d5a538;display:grid;place-items:center;font:800 36px Georgia;box-shadow:0 14px 40px rgba(0,0,0,.28);transition:.22s ease}.brand:active .logo{transform:scale(.94);box-shadow:0 0 28px rgba(213,165,56,.22)}.bt{font-size:23px;font-weight:900;letter-spacing:.32em}.bs{font-size:13px;letter-spacing:.33em;color:rgba(255,255,255,.45)}.out{border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);padding:13px 21px;font-weight:900;font-size:16px;transition:.2s ease}.out:active,.tile:active,.bottom button:active,.btn:active,.fab:active{transform:scale(.96)}.wrap{max-width:760px;margin:0 auto;padding:28px 26px}.sync{font-size:12px;text-align:center;color:rgba(255,255,255,.34);margin:0 0 14px}.card,.panel,.reward{background:linear-gradient(135deg,rgba(255,255,255,.075),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);border-radius:32px;box-shadow:0 24px 70px rgba(0,0,0,.35);backdrop-filter:blur(18px)}.hero{padding:34px 36px;margin-bottom:34px}.name{font-size:50px;line-height:1;margin:0 0 22px;font-weight:900}.muted{color:rgba(255,255,255,.56)}.gold{color:#d5a538}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:17px;margin-top:34px}.stat{text-align:center;min-height:126px;border-radius:24px;padding:27px 8px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12)}.stat b{display:block;font-size:34px}.stat span{font-size:21px;color:rgba(255,255,255,.55)}.list{overflow:hidden}.tile{display:flex;align-items:center;gap:24px;padding:31px;border-bottom:1px solid rgba(255,255,255,.08);transition:.2s ease;cursor:pointer}.tile:last-child{border:0}.tile:hover{background:rgba(213,165,56,.035)}.ico{width:66px;height:66px;border-radius:21px;display:grid;place-items:center;background:rgba(213,165,56,.10);color:#d5a538;box-shadow:inset 0 0 0 1px rgba(213,165,56,.10)}.svgico{width:34px;height:34px;display:block}.tile h2{font-size:33px;margin:0 0 7px}.tile p{font-size:22px;margin:0;color:rgba(255,255,255,.55)}.mini{font-size:16px;letter-spacing:.34em;text-transform:uppercase;color:rgba(255,255,255,.45);font-weight:900}.reward{position:relative;padding:44px 36px;border-color:rgba(213,165,56,.34)}.orb{position:absolute;right:36px;top:48px;width:134px;height:134px;border-radius:50%;border:1px solid rgba(213,165,56,.42);display:grid;place-items:center;text-align:center}.orb b{font-size:56px}.tier{font-size:64px;margin:35px 0 20px;line-height:.9}.reward p,.benefits{font-size:23px;line-height:1.55}.bar{height:14px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#f2c66d,#d5a538)}.panel{padding:38px 36px}.panel h1{font-size:42px;margin:0 0 28px}.inner{border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.13);padding:34px;margin-top:22px}.empty{min-height:430px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center}.empty h2{font-size:41px}.input{width:100%;height:58px;border-radius:18px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.055);color:white;padding:0 20px;font-size:16px;outline:none}.input:focus{border-color:rgba(213,165,56,.65);box-shadow:0 0 0 4px rgba(213,165,56,.08)}.btn{border:0;border-radius:22px;padding:17px 25px;background:linear-gradient(135deg,#f2c66d,#d5a538);color:#07111f;font-weight:900;font-size:16px;box-shadow:0 16px 38px rgba(213,165,56,.20);transition:.2s ease}.fab{position:fixed;right:32px;bottom:124px;width:70px;height:70px;border-radius:50%;border:0;background:linear-gradient(135deg,#f6cf78,#d5a538);display:grid;place-items:center;color:#07111f;box-shadow:0 0 48px rgba(213,165,56,.28);transition:.2s ease;text-decoration:none;z-index:8}.fab .svgico{width:32px;height:32px}.bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(2,8,19,.95);border-top:1px solid rgba(255,255,255,.1);display:grid;grid-template-columns:repeat(4,1fr);padding:13px 8px calc(13px + env(safe-area-inset-bottom));backdrop-filter:blur(18px)}.bottom button{background:0;border:0;color:rgba(255,255,255,.55);font-weight:900;font-size:14px;white-space:pre-line;transition:.2s ease}.bottom button .svgico{width:30px;height:30px;margin:0 auto 6px}.bottom .on{color:#d5a538}.journey{width:100%;text-align:left;margin-top:16px}.journey h3{margin:0 0 8px;font-size:22px}@media(max-width:520px){.wrap{padding:28px 16px}.hero{padding:30px 20px}.name{font-size:42px}.stats{gap:12px}.stat b{font-size:31px}.tile h2{font-size:29px}.reward,.panel{padding:36px 28px}.orb{width:108px;height:108px;right:28px}.tier{font-size:58px}.fab{width:64px;height:64px;right:26px;bottom:116px}.fab .svgico{width:29px;height:29px}}
  `}</style><header className="head"><a className="brand" href="/"><div className="logo">E</div><div><div className="bt">EV EXEC</div><div className="bs">MY ACCOUNT</div></div></a><button className="out" onClick={()=>{try{localStorage.clear();sessionStorage.clear()}catch{};location.href='/#account'}}>Sign Out</button></header><div className="wrap">{sync==='syncing'&&<p className="sync">Syncing account details…</p>}{tab==='dash'&&<><section className="card hero"><h1 className="name">{name}</h1><p className="muted" style={{fontSize:22}}>{email}</p><div className="stats"><div className="stat"><b className="gold">{completed*12}kg</b><span>CO2<br/>Saved</span></div><div className="stat"><b>{journeys.length}</b><span>Trips</span></div><div className="stat"><b>-</b><span>Rating</span></div></div></section><section className="card list"><div className="tile" onClick={()=>setTab('trips')}><div className="ico"><Icon type="calendar"/></div><div><h2>Upcoming Rides</h2><p>{upcoming?`${upcoming} Upcoming`:'No Upcoming Rides'}</p></div></div><div className="tile" onClick={()=>setTab('rew')}><div className="ico"><Icon type="star"/></div><div><h2 className="gold">Privilege Points</h2><p>{pts} pts · {tier} Tier</p></div></div></section></>}{tab==='rew'&&<><section className="reward"><div className="orb"><div><b>{pts}</b><br/><span className="gold">PTS</span></div></div><div className="mini">Current Status</div><h1 className="tier">{tier}</h1><p><span className="gold">EV EXEC</span> Privilege Member</p><p className="muted">{Math.max(0,(pts>=10?20:10)-pts)} more points to reach <span className="gold">{pts>=10?'Executive':'Preferred'}</span></p><div className="bar"><span style={{width:Math.min(100,pts*10)+'%'}}/></div></section><br/><section className="panel"><div className="mini">Client Benefits</div><p className="muted benefits">Premium EV experience on every journey<br/>Fixed-price fares — no surge pricing<br/>100% zero-emission Tesla Model Y</p></section></>}{tab==='trips'&&<section className="panel"><div className="mini">Journey History</div><h1>Your Trips</h1>{journeys.length?journeys.map(x=><div className="inner journey" key={x.id||x.ref}><h3>{x.airport||x.journey_type||'Airport Transfer'}</h3><p className="muted">{whenText(x)}</p><p className="gold">{statusText(x)}</p></div>):<div className="inner empty"><div className="ico"><Icon type="car"/></div><h2>No journeys yet</h2><p className="muted">Your completed transfers and invoices will appear here automatically.</p></div>}</section>}{tab==='acct'&&<section className="panel"><h1>Account</h1><div className="inner"><b>Email</b><p className="muted" style={{fontSize:23}}>{email}</p></div><div className="inner"><b>Change Password</b><br/><br/><input className="input" type="password" placeholder="New password" value={password.one} onChange={e=>setPassword({...password,one:e.target.value,msg:''})}/><br/><br/><input className="input" type="password" placeholder="Confirm password" value={password.two} onChange={e=>setPassword({...password,two:e.target.value,msg:''})}/><br/><br/><button className="btn" onClick={changePassword}>Update Password</button>{password.msg&&<p className="muted">{password.msg}</p>}</div></section>}</div><a className="fab" href={chatUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat with EV Exec"><Icon type="chat"/></a><nav className="bottom">{nav.map(n=><button key={n[0]} className={tab===n[0]?'on':''} onClick={()=>setTab(n[0])}><Icon type={n[1]}/>{n[2]}</button>)}</nav></main>
}
