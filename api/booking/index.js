'use strict';
const E=require('../../lib/emailContent');
const {dbInsert,dbGet,dbUpdate,dbFindOne,isValidUUID}=require('../../lib/supabase');
const {sendSMS,sendEmail,sendWhatsApp,whatsAppReady,normaliseUkPhone,sendPushToOperator,handOffSmsToOperator}=require('../../lib/notify');const {smsEnabled}=require('../../lib/channels');
const {logMany}=require('../../lib/notifyLog');
const {enqueueNotification,sendOrQueue}=require('../../lib/notificationQueue');
const {generateToken,verifyToken}=require('../../lib/token');
const {refreshPricing,currentPricing}=require('../../lib/pricing');
const {journeyLine,fmtDate,fmtTime,lookupPrice,getPrice,buildOperatorJobOfferSms,emailJourneyHtml,refBadgeHtml,singleLineSubject,isReturnLeg}=require('../../lib/format');
const {parseBody}=require('../../lib/parse');
const P=require('../../lib/cancellation');
const {emailLayout}=require('../../lib/emailLayout');
const {verifyAuth}=require('../../lib/auth');
const SAFE=new Set(['id','ref','status','journey_type','pickup_location','airport','flight_number','dropoff_address','travel_date','travel_time','passengers','luggage','return_journey','return_airport','return_date','return_time','quoted_price','payment_method','payment_status','customer_name','operator_response','source']);
// Fire-and-forget initial flight verification (Requirement 7). Runs
// server-to-server against the evexecoperator Supabase Edge Function
// (verify-flight), which does the actual AeroDataBox lookup and persists
// the result -- this never blocks or fails booking creation itself.
function triggerInitialFlightVerification(bookingRow){
  if(!bookingRow||!bookingRow.flight_number)return;
  const base=process.env.SUPABASE_URL,sk=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!sk)return;
  fetch(`${base}/functions/v1/verify-flight`,{
    method:'POST',
    headers:{'Content-Type':'application/json',apikey:sk,Authorization:`Bearer ${sk}`},
    body:JSON.stringify({bookingId:bookingRow.id,leg:'outbound',source:'auto_initial'})
  }).catch(err=>console.error('Initial flight verification failed:',bookingRow.id,err.message||err));
}
function j(res,c,p){res.statusCode=c;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store, max-age=0');return res.end(JSON.stringify(p));}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function route(req){const p=(req.url||'').split('?')[0];return p.endsWith('/get')?'get':p.endsWith('/create')?'create':p.endsWith('/config')?'config':p.endsWith('/cancel')?'cancel':p.endsWith('/lookup')?'lookup':'index';}
function cancelPage(title,msg,isOk=false,actions=''){const hdr=isOk?'#10b981':'#374151';const htxt=isOk?'#06101c':'#fff';return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | EV Exec</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Manrope,Arial,sans-serif;background:#020813;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{max-width:420px;width:100%;border-radius:16px;overflow:hidden}.hd{background:${hdr};padding:24px 28px}.hd h1{font-size:1.15rem;font-weight:700;color:${htxt}}.bd{background:#07111f;border:1px solid rgba(255,255,255,.1);border-top:none;padding:28px;border-radius:0 0 16px 16px}.bd p{color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:14px}.bd a{color:#d5a538}.btn{display:block;width:100%;text-align:center;border:none;border-radius:8px;padding:13px;font:700 14px Manrope,Arial,sans-serif;background:linear-gradient(135deg,#d5a538,#b8891f);color:#06101c;cursor:pointer;margin-bottom:10px;text-decoration:none}.bd a.btn.alt{background:transparent;border:1px solid rgba(255,255,255,.2);color:#fff;margin-bottom:18px}</style></head><body><div class="card"><div class="hd"><h1>${title}</h1></div><div class="bd"><p>${msg}</p>${actions}<p style="font-size:13px;color:rgba(255,255,255,.45)">Need help? <a href="https://wa.me/447721070370">WhatsApp us</a> or call <a href="tel:07721070370">07721 070370</a></p></div></div></body></html>`;}
// Customer self-cancel link (in the Request Received email). GET shows what
// cancelling would cost under the booking's policy and asks to confirm; only
// the POST from that page cancels, so a link scanner opening the email can't.
async function handleCancel(req,res){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store, max-age=0');
  const{id,token}=req.query||{};
  if(!id||!token){res.statusCode=400;return res.end(cancelPage('Invalid Link','This cancellation link is missing required parameters.'));}
  if(!isValidUUID(id)){res.statusCode=400;return res.end(cancelPage('Invalid Link','This link contains an invalid booking ID.'));}
  if(!verifyToken(id,'cancel',token)){res.statusCode=403;return res.end(cancelPage('Invalid Link','This link is invalid or has already been used.'));}
  try{
    const booking=await dbGet('bookings',id);
    if(!booking){res.statusCode=404;return res.end(cancelPage('Not Found','No booking found with this ID.'));}
    const done=['Cancelled','Completed','No Show'];
    if(done.includes(booking.status))return res.end(cancelPage('Already Resolved',`This booking is already marked as <strong>${esc(booking.status)}</strong>.`));
    const inProgress=['En Route','Arrived','Passenger On Board'];
    if(inProgress.includes(booking.status))return res.end(cancelPage('Driver En Route','Your driver is already on the way. Please call us immediately on <a href="tel:07721070370">07721 070370</a>.'));
    const q=P.cancellationQuote(booking);
    const leg=booking.return_journey?' This cancels your outward journey. To cancel your return journey as well, please contact us.':'';
    const policy=`<a href="${P.policyPath(q.version)}#cancellation">cancellation policy</a>`;
    if(req.method!=='POST'){
      const url=`/api/booking/cancel?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
      return res.end(cancelPage('Cancel Your Booking',
        `${esc(journeyLine(booking))}<br>${fmtDate(booking.travel_date)} at ${fmtTime(booking.travel_time,booking.travel_date)} &middot; Ref ${esc(booking.ref||'')}<br><br>${P.chargeSentence(q)} ${P.refundSentence(q)}${leg} See our ${policy}.`,
        false,
        `<form method="post" action="${url}"><button class="btn" type="submit">Cancel my booking</button></form><a class="btn alt" href="/booking?id=${encodeURIComponent(id)}">Keep my booking</a>`));
    }
    const now=new Date();
    const record=`Cancelled by customer (link) at ${P.ukStamp(now)}: ${q.request?'request, no charge':`${q.pct}% charge${q.charge!=null?` ${P.money(q.charge)}`:''}, policy v${q.version}`}.`;
    try{await dbUpdate('bookings',id,{status:'Cancelled',cancelled_at:now.toISOString(),cancelled_by:'customer',cancellation_charge:q.charge});}
    catch(_){await dbUpdate('bookings',id,{status:'Cancelled',notes:[booking.notes,record].filter(Boolean).join('\n')});}
    const opCancel=E.staffCustomerCancelled(booking,q),opEmail=(process.env.OPERATOR_EMAIL||'').trim();
    sendPushToOperator('Booking Cancelled',`${booking.customer_name} cancelled their transfer on ${fmtDate(booking.travel_date)}${q.charge?` (charge ${P.money(q.charge)})`:''}`,'/operator').catch(()=>{});
    if(opEmail)sendOrQueue(()=>sendEmail({to:opEmail,subject:opCancel.subject,html:opCancel.html,text:opCancel.text}),{booking_id:booking.id,type:'cancelled',channel:'email',recipient:opEmail,subject:opCancel.subject,html:opCancel.html,body:opCancel.text,meta:{label:'operator_cancel'}}).catch(e=>console.error('Cancel operator email failed:',e));
    // No SMS-to-operator fallback when there's no operator email -- the push
    // above already covers that case, and this isn't a customer-facing send
    // that needs the two-tap review step (matches sendConfirmations' convention).
    const cfirst=(booking.customer_name||'there').split(' ')[0];
    const custCancelSms=`Hi ${cfirst}, your EV Exec transfer on ${fmtDate(booking.travel_date)} has been cancelled. ${P.chargeSentence(q)} ${P.refundSentence(q)} To rebook: https://www.evexec.co.uk`;
    const custCancel=E.cancelledByCustomer(booking,q);
    if(booking.customer_email)sendOrQueue(()=>sendEmail({to:booking.customer_email,subject:custCancel.subject,html:custCancel.html,text:custCancel.text}),{booking_id:booking.id,type:'cancelled',channel:'email',recipient:booking.customer_email,subject:custCancel.subject,html:custCancel.html,body:custCancel.text,meta:{label:'customer_cancel'}}).catch(e=>console.error('Cancel customer email failed:',e));
    else if(booking.customer_phone)handOffSmsToOperator(booking,custCancelSms,'cancellation').catch(e=>console.error('Cancel customer SMS handoff failed:',e));
    return res.end(cancelPage('Booking Cancelled',`Your EV Exec transfer has been cancelled. ${P.chargeSentence(q).replace('cancelling now costs','the cancellation charge is')} ${P.refundSentence(q)}${leg}<br><br>If you need to rebook, visit <a href="https://www.evexec.co.uk">evexec.co.uk</a> or WhatsApp us.`,true));
  }catch(err){console.error('Cancel error:',err);res.statusCode=500;return res.end(cancelPage('Error','Something went wrong. Please call us on <a href="tel:07721070370">07721 070370</a> to cancel manually.'));}
}
function config(req,res){const pr=currentPricing();if(req.method==='GET')return j(res,200,{pricing:{airports:pr.airports.map(a=>({name:a.name,oneWay:a.oneWay,ret:a.ret})),extraStop:pr.extraStop},supabaseUrl:process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://yoltkmhtxwluqxxpewbl.supabase.co',supabaseAnon:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo',vapidPublic:process.env.VAPID_PUBLIC_KEY||process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||'',googleMapsApiKey:process.env.GOOGLE_MAPS_API_KEY||process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY||'',stripePublishableKey:process.env.STRIPE_PUBLISHABLE_KEY||''});if(req.method==='POST')return create(req,res);return j(res,405,{error:'Method not allowed'});}
function compact(label,result){return result.status==='fulfilled'?{label,ok:true}:{label,ok:false,error:result.reason&&result.reason.message?result.reason.message:String(result.reason||'Unknown error')};}
async function qfail(status,payload){if(!status||status.ok)return null;try{await enqueueNotification(payload);return {...status,queued:true};}catch(err){console.error('Failed to queue notification retry:',status.label,err);return {...status,queued:false,queueError:err.message||String(err)};}}
async function notify(booking){const site=process.env.SITE_URL||'https://evexec.co.uk',r=journeyLine(booking),d=fmtDate(booking.travel_date),price=getPrice(booking),first=(booking.customer_name||'there').split(' ')[0];let accept,reject,cancelUrl;try{accept=`${site}/api/operator/accept?id=${booking.id}&token=${generateToken(booking.id,'accept')}`;reject=`${site}/api/operator/reject?id=${booking.id}&token=${generateToken(booking.id,'reject')}`;cancelUrl=`${site}/api/booking/cancel?id=${booking.id}&token=${generateToken(booking.id,'cancel')}`;}catch(e){console.error('generateToken failed (OPERATOR_ACTION_SECRET missing?):', e.message);accept=`${site}/booking?id=${booking.id}`;reject=`${site}/booking?id=${booking.id}`;cancelUrl=`${site}/booking?id=${booking.id}`;}const opTxt=buildOperatorJobOfferSms(booking,accept,reject);const custTxt=`Hi ${first}, your EV Exec booking request has been received!\n\n${r}\n${d} at ${fmtTime(booking.travel_time,booking.travel_date)}\n\nWe'll confirm availability shortly.\n\nModify: https://wa.me/447721070370\nCancel: ${cancelUrl}`;const t=fmtTime(booking.travel_time,booking.travel_date);const opMail=E.staffNewBooking(booking,{acceptUrl:accept,rejectUrl:reject}),opHtml=opMail.html;const custMail=E.requestReceived(booking,{cancelUrl}),custHtml=custMail.html;const opEmail=(process.env.OPERATOR_EMAIL||'').trim();const opBookingSubject=opMail.subject;sendPushToOperator(`New Booking: ${r}`,`${booking.customer_name} · ${d} at ${fmtTime(booking.travel_time,booking.travel_date)}`,'/operator').catch(()=>{});const items=[{label:'operator_sms',canSend:Boolean(smsEnabled()&&process.env.OPERATOR_PHONE&&!opEmail),task:()=>sendSMS(process.env.OPERATOR_PHONE,opTxt),queue:{booking_id:booking.id,type:'received',channel:'sms',recipient:process.env.OPERATOR_PHONE,body:opTxt,meta:{label:'operator_sms'}}},{label:'operator_email',canSend:Boolean(opEmail),task:()=>sendEmail({to:opEmail,subject:opBookingSubject,html:opHtml,text:opMail.text}),queue:{booking_id:booking.id,type:'received',channel:'email',recipient:opEmail,subject:opBookingSubject,html:opHtml,body:opMail.text,meta:{label:'operator_email'}}},{label:'customer_email',canSend:Boolean(booking.customer_email),task:()=>sendEmail({to:booking.customer_email,subject:custMail.subject,html:custHtml,text:custMail.text}),queue:{booking_id:booking.id,type:'received',channel:'email',recipient:booking.customer_email,subject:custMail.subject,html:custHtml,body:custMail.text,meta:{label:'customer_email'}}}];const settled=await Promise.allSettled(items.map(x=>x.canSend?x.task():Promise.resolve('not configured or missing')));const statuses=settled.map((r,i)=>compact(items[i].label,r));
  // Customer: email is handled above via the items array. No email on file ->
  // hand the SMS off to staff via the two-tap automation instead of a direct
  // Twilio send.
  const customerHandoff=(!booking.customer_email&&booking.customer_phone)?await handOffSmsToOperator(booking,custTxt,'confirmation').then(()=>({ok:true})).catch(e=>({ok:false,error:e.message||String(e)})):null;
  const sent=[];if(statuses[0].ok&&process.env.OPERATOR_PHONE)sent.push(['sms',normaliseUkPhone(process.env.OPERATOR_PHONE)]);if(statuses[1].ok&&opEmail)sent.push(['email',opEmail]);if(statuses[2].ok&&booking.customer_email)sent.push(['email',booking.customer_email]);if(customerHandoff&&customerHandoff.ok)sent.push(['two_tap_operator_sms','operator']);if(sent.length)await logMany(booking.id,'received',sent);const out=[];for(let i=0;i<statuses.length;i++)out.push(!items[i].canSend?{...statuses[i],skipped:true}:await qfail(statuses[i],items[i].queue));if(customerHandoff)out.push(customerHandoff.ok?{label:'customer_sms_handoff',ok:true}:{label:'customer_sms_handoff',ok:false,error:customerHandoff.error});out.filter(s=>!s.ok&&!s.skipped).forEach(s=>console.error('Booking notification failed:',s.label,s.error));return out;}
// Public-form guards (the quote form has the same): a hidden honeypot field
// bots fill in, length caps so the form can't store or email large payloads,
// a real email address when one is given, and no dates in the past.
const LIMITS={customer_name:100,customer_email:200,customer_phone:30,pickup_location:300,dropoff_address:300,airport:100,return_airport:100,return_pickup:300,return_destination:300,flight_number:20,return_flight:20,luggage:200,notes:2000,travel_time:10,return_time:10,journey_type:40,contact_method:40};
function ukToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date());}
function validateBooking(body){
  if(body.company_website)return 'spam';
  if(body.terms_accepted!==true)return 'Please accept the cancellation policy to continue. If you cannot see the tick box, refresh the page.';
  for(const [k,n] of Object.entries(LIMITS))if(body[k]!=null&&String(body[k]).length>n)return 'Some details are too long. Please shorten them and try again.';
  const email=body.customer_email?String(body.customer_email).trim():'';
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return 'Please enter a valid email address.';
  const isDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d));
  if(!body.travel_date||!isDate(body.travel_date))return 'Please choose a travel date.';
  if(body.travel_date<ukToday())return 'The travel date is in the past. Please choose another date.';
  if(body.return_journey&&body.return_date&&(!isDate(body.return_date)||body.return_date<body.travel_date))return 'The return date must be on or after the travel date.';
  const pax=parseInt(body.passengers,10);if(body.passengers!=null&&(!(pax>=1)||pax>16))return 'Please enter the number of passengers.';
  if(Array.isArray(body.additional_stops)&&(body.additional_stops.length>5||body.additional_stops.some(x=>String(x).length>300)))return 'Please contact us for journeys with more than five stops.';
  return null;
}
function ref(){return 'EVX-'+(Date.now().toString(36)+Math.random().toString(36).slice(2,6)).toUpperCase();}
function returnLegPayload(body,base,totalPrice){const airport=body.return_airport||body.airport||null;
// The return leg runs the opposite direction of the outbound leg (an
// outbound "To Airport" trip returns "From Airport", and vice versa).
const returnJourneyType=body.journey_type==='From Airport'?'To Airport':'From Airport';
return {journey_type:returnJourneyType,pickup_location:body.return_pickup||airport,airport,flight_number:body.return_flight||null,dropoff_address:body.return_destination||body.pickup_location||body.dropoff_address||null,travel_date:body.return_date||null,travel_time:body.return_time||null,passengers:parseInt(body.passengers)||1,luggage:body.luggage||null,return_journey:false,return_pickup:null,return_airport:null,return_flight:null,return_date:null,return_time:null,return_destination:null,contact_method:body.contact_method||'WhatsApp',customer_name:base.customer_name,customer_phone:base.customer_phone,customer_email:base.customer_email,user_id:base.user_id||null,status:'Unassigned',payment_status:base.payment_status||'Unpaid',quoted_price:0,payment_method:base.payment_method||null,notes:['Return leg created automatically from return booking.',totalPrice?`Original return fare: £${totalPrice}.`:null,base.ref?`Outbound ref: ${base.ref}`:null].filter(Boolean).join(' '),ref:ref()};}
async function create(req,res){if(req.method!=='POST')return j(res,405,{error:'Method not allowed'});let body;try{body=await parseBody(req);}catch{return j(res,400,{error:'Invalid request body'});}const name=(body.customer_name||'').trim(),phone=normaliseUkPhone(body.customer_phone||'');if(!name||!phone)return j(res,400,{error:'Name and phone number are required.'});const invalid=validateBooking(body);if(invalid==='spam')return j(res,200,{success:true});if(invalid)return j(res,400,{error:invalid});const authUser=await verifyAuth(req).catch(()=>null),airport=body.airport||null,basePrice=lookupPrice(airport,Boolean(body.return_journey));const stops=Array.isArray(body.additional_stops)?body.additional_stops.filter(s=>s&&String(s).trim()):[];const totalPrice=basePrice!=null?basePrice+stops.length*currentPricing().extraStop:basePrice;const booking=await dbInsert('bookings',{journey_type:body.journey_type||'To Airport',pickup_location:body.pickup_location||null,airport,flight_number:body.flight_number||null,dropoff_address:body.dropoff_address||null,travel_date:body.travel_date||null,travel_time:body.travel_time||null,passengers:parseInt(body.passengers)||1,luggage:body.luggage||null,return_journey:Boolean(body.return_journey),return_pickup:body.return_pickup||null,return_airport:body.return_airport||null,return_flight:body.return_flight||null,return_date:body.return_date||null,return_time:body.return_time||null,return_destination:body.return_destination||null,contact_method:body.contact_method||'WhatsApp',customer_name:name,customer_phone:phone,customer_email:body.customer_email?body.customer_email.trim():null,user_id:authUser?authUser.id:null,status:'Unassigned',payment_status:'Unpaid',quoted_price:totalPrice,notes:stops.length?stops.map((s,i)=>`Stop ${i+1}: ${s}`).join('\n'):null,ref:ref()});let returnBooking=null;if(body.return_journey&&body.return_date&&body.return_time){returnBooking=await dbInsert('bookings',returnLegPayload(body,booking,totalPrice));}
// The customer ticked the policy box (validateBooking requires it).
await Promise.all([booking,returnBooking].filter(Boolean).map(b=>P.recordAcceptance(b,dbUpdate)));
triggerInitialFlightVerification(booking);
if(returnBooking)triggerInitialFlightVerification(returnBooking);
const notifications=await notify({...booking,additional_stops:stops}).catch(err=>[{label:'notification_batch',ok:false,queued:false,error:err.message||String(err)}]);return j(res,200,{success:true,bookingId:booking.id,returnBookingId:returnBooking?returnBooking.id:null,notifications});}
async function get(req,res){const id=req.query&&req.query.id;if(!id||!isValidUUID(id))return j(res,400,{error:'Invalid booking ID'});const b=await dbGet('bookings',id);if(!b)return j(res,404,{error:'Booking not found'});const safe={};for(const k of SAFE)if(k in b)safe[k]=b[k];safe.return_leg=isReturnLeg(b);if(safe.return_leg){const m=String(b.notes||'').match(/Outbound ref: (EVX-[A-Z0-9]+)/);safe.outbound_ref=m?m[1]:null;}safe.needs_terms=P.needsAcceptance(b);safe.policy_version=P.policyVersion(b);return j(res,200,safe);}
async function lookup(req,res){if(req.method!=='POST')return j(res,405,{error:'Method not allowed'});let body;try{body=await parseBody(req);}catch{return j(res,400,{error:'Invalid request body'});}const ref=String(body.ref||'').trim().toUpperCase();const phone=normaliseUkPhone(body.phone||'');const genericError={error:'No booking found. Check your reference and phone number and try again.'};if(!ref.startsWith('EVX-')||ref.length<7||!phone)return j(res,400,genericError);try{const b=await dbFindOne('bookings',{ref},'id,customer_phone');if(!b||normaliseUkPhone(b.customer_phone)!==phone)return j(res,404,genericError);return j(res,200,{id:b.id});}catch(err){console.error('Booking lookup error:',err);return j(res,500,genericError);}}
// notifyStatus() (formerly the /notify-status route, En Route / No Show
// customer notices via direct Twilio SMS fallback) was removed: nothing in
// any of the three repos ever called it (confirmed by repo-wide grep for
// "notify-status"), and the customer notice it existed to send is already
// covered by evexecoperator's enqueue_operator_customer_notifications() DB
// trigger, which handles En Route/Arrived/Cancelled via email or the
// two-tap handoff. Keeping dead-but-Twilio-capable code around was a
// landmine for future accidental wiring, not a live gap.
module.exports=async function handler(req,res){try{await refreshPricing();const r=route(req);if(r==='config')return config(req,res);if(r==='create')return create(req,res);if(r==='get')return get(req,res);if(r==='cancel')return handleCancel(req,res);if(r==='lookup')return lookup(req,res);return j(res,200,{ok:true,service:'booking'});}catch(err){console.error('Booking router error:',err);return j(res,500,{error:route(req)==='create'?'Failed to save booking. Please contact us directly.':'Failed to load booking'});}};