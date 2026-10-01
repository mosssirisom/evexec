'use strict';
const {dbInsert,dbGet,dbUpdate,dbFindOne,isValidUUID}=require('../../lib/supabase');
const {sendSMS,sendEmail,sendWhatsApp,whatsAppReady,normaliseUkPhone,sendPushToOperator,handOffSmsToOperator}=require('../../lib/notify');
const {logMany}=require('../../lib/notifyLog');
const {enqueueNotification,sendOrQueue}=require('../../lib/notificationQueue');
const {generateToken,verifyToken}=require('../../lib/token');
const {lookupPrice,singleLineSubject}=require('../../lib/format');
const {routeLine,ukWhen}=require('../../lib/correspondence');
const {customerRequestReceived,operatorNewBooking,operatorCancelled}=require('../../lib/messages');
const {parseBody}=require('../../lib/parse');
const {verifyAuth}=require('../../lib/auth');
const SAFE=new Set(['id','ref','status','journey_type','pickup_location','airport','flight_number','dropoff_address','travel_date','travel_time','passengers','luggage','return_journey','return_airport','return_date','return_time','quoted_price','payment_method','payment_status','customer_name']);
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
function route(req){const p=(req.url||'').split('?')[0];return p.endsWith('/get')?'get':p.endsWith('/create')?'create':p.endsWith('/config')?'config':p.endsWith('/cancel')?'cancel':p.endsWith('/lookup')?'lookup':'index';}
function cancelPage(title,msg,isOk=false){const hdr=isOk?'#10b981':'#374151';const htxt=isOk?'#06101c':'#fff';return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | EV Exec</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,Arial,sans-serif;background:#020813;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{max-width:420px;width:100%;border-radius:16px;overflow:hidden}.hd{background:${hdr};padding:24px 28px}.hd h1{font-size:1.15rem;font-weight:700;color:${htxt}}.bd{background:#07111f;border:1px solid rgba(255,255,255,.1);border-top:none;padding:28px;border-radius:0 0 16px 16px}.bd p{color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:14px}.bd a{color:#d5a538}</style></head><body><div class="card"><div class="hd"><h1>${title}</h1></div><div class="bd"><p>${msg}</p><p style="font-size:13px;color:rgba(255,255,255,.45)">Need help? <a href="https://wa.me/447721070370">WhatsApp us</a> or call <a href="tel:07721070370">07721 070370</a></p></div></div></body></html>`;}
async function handleCancel(req,res){res.setHeader('Content-Type','text/html; charset=utf-8');const{id,token}=req.query||{};if(!id||!token){res.statusCode=400;return res.end(cancelPage('Invalid Link','This cancellation link is missing required parameters.'));}if(!isValidUUID(id)){res.statusCode=400;return res.end(cancelPage('Invalid Link','This link contains an invalid booking ID.'));}if(!verifyToken(id,'cancel',token)){res.statusCode=403;return res.end(cancelPage('Invalid Link','This link is invalid or has already been used.'));}try{const booking=await dbGet('bookings',id);if(!booking){res.statusCode=404;return res.end(cancelPage('Not Found','No booking found with this ID.'));}const done=['Cancelled','Completed','No Show'];if(done.includes(booking.status))return res.end(cancelPage('Already Resolved',`This booking is already marked as <strong>${booking.status}</strong>.`));const inProgress=['En Route','Passenger On Board'];if(inProgress.includes(booking.status))return res.end(cancelPage('Driver En Route','Your driver is already on the way. Please call us immediately on <a href="tel:07721070370">07721 070370</a>.'));await dbUpdate('bookings',id,{status:'Cancelled'});const cancelled={...booking,status:'Cancelled'};const opMsg=operatorCancelled(cancelled);const opEmail=(process.env.OPERATOR_EMAIL||'').trim();const opCancelSubject=singleLineSubject(opMsg.subject);sendPushToOperator('Booking cancelled by customer',`${booking.customer_name||'Customer'} · ${routeLine(booking)}, ${ukWhen(booking.travel_date,booking.travel_time)}`,'/operator').catch(()=>{});if(opEmail)sendOrQueue(()=>sendEmail({to:opEmail,subject:opCancelSubject,html:opMsg.html}),{booking_id:booking.id,type:'cancelled',channel:'email',recipient:opEmail,subject:opCancelSubject,html:opMsg.html}).catch(e=>console.error('Cancel operator email failed:',e));
  // The customer's own cancellation notice is sent by the bookings status
  // trigger (enqueue_operator_customer_notifications -> status_cancelled),
  // the same path as a cancellation made in the operator app, so it is
  // never sent twice. No SMS-to-operator fallback: the push above covers it.
  return res.end(cancelPage('Booking Cancelled',`Your EV Exec transfer has been cancelled. No payment has been taken.<br><br>If you need to rebook, visit <a href="https://evexec.co.uk">evexec.co.uk</a> or WhatsApp us.`,true));}catch(err){console.error('Cancel error:',err);res.statusCode=500;return res.end(cancelPage('Error','Something went wrong. Please call us on <a href="tel:07721070370">07721 070370</a> to cancel manually.'));}}
function config(req,res){if(req.method==='GET')return j(res,200,{supabaseUrl:process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||'https://yoltkmhtxwluqxxpewbl.supabase.co',supabaseAnon:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvbHRrbWh0eHdsdXF4eHBld2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0ODMwNjgsImV4cCI6MjA5NTA1OTA2OH0.kLwJK13TsSNn4oK3NZj33awGigWfdKgPP-cbqpqrIbo',vapidPublic:process.env.VAPID_PUBLIC_KEY||process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||'',googleMapsApiKey:process.env.GOOGLE_MAPS_API_KEY||process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY||'',stripePublishableKey:process.env.STRIPE_PUBLISHABLE_KEY||''});if(req.method==='POST')return create(req,res);return j(res,405,{error:'Method not allowed'});}
async function award(userId){const base=process.env.SUPABASE_URL,sk=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!base||!sk||!userId)return;const h={'Content-Type':'application/json',apikey:sk,Authorization:`Bearer ${sk}`};const cur=await fetch(`${base}/rest/v1/profiles?id=eq.${userId}&select=privilege_points&limit=1`,{headers:h});if(!cur.ok)return;const rows=await cur.json();const pts=rows[0]?(rows[0].privilege_points||0)+1:1;await fetch(`${base}/rest/v1/profiles?id=eq.${userId}`,{method:'PATCH',headers:{...h,Prefer:'return=minimal'},body:JSON.stringify({privilege_points:pts,updated_at:new Date().toISOString()})});}
function compact(label,result){return result.status==='fulfilled'?{label,ok:true}:{label,ok:false,error:result.reason&&result.reason.message?result.reason.message:String(result.reason||'Unknown error')};}
async function qfail(status,payload){if(!status||status.ok)return null;try{await enqueueNotification(payload);return {...status,queued:true};}catch(err){console.error('Failed to queue notification retry:',status.label,err);return {...status,queued:false,queueError:err.message||String(err)};}}
async function notify(booking){const site=process.env.SITE_URL||'https://evexec.co.uk',first=(booking.customer_name||'there').split(' ')[0]
let cancelUrl
try{cancelUrl=`${site}/api/booking/cancel?id=${booking.id}&token=${generateToken(booking.id,'cancel')}`;}catch(e){console.error('generateToken failed (OPERATOR_ACTION_SECRET missing?):', e.message);cancelUrl=`${site}/booking?id=${booking.id}`;}
// Bookings are accepted/rejected in the operator app; the email/SMS link
// opens it rather than acting directly (the old one-click accept/reject
// links sent their own, separate customer messages).
const dispatchUrl=`${process.env.OPERATOR_APP_URL||'https://evexecoperator.vercel.app'}/operator/dispatch`
const cust=customerRequestReceived(booking,{cancelUrl}),op=operatorNewBooking(booking,{dispatchUrl})
const opEmail=(process.env.OPERATOR_EMAIL||'').trim()
const opBookingSubject=singleLineSubject(op.subject)
sendPushToOperator(`New booking: ${booking.customer_name||'customer'}`,`${routeLine(booking)}, ${ukWhen(booking.travel_date,booking.travel_time)}`,'/operator').catch(()=>{})
const items=[{label:'operator_sms',canSend:Boolean(process.env.OPERATOR_PHONE&&!opEmail),task:()=>sendSMS(process.env.OPERATOR_PHONE,op.text),queue:{booking_id:booking.id,type:'received',channel:'sms',recipient:process.env.OPERATOR_PHONE,body:op.text,meta:{label:'operator_sms'}}},{label:'operator_email',canSend:Boolean(opEmail),task:()=>sendEmail({to:opEmail,subject:opBookingSubject,html:op.html}),queue:{booking_id:booking.id,type:'received',channel:'email',recipient:opEmail,subject:opBookingSubject,html:op.html,meta:{label:'operator_email'}}},{label:'customer_email',canSend:Boolean(booking.customer_email),task:()=>sendEmail({to:booking.customer_email,subject:cust.subject,html:cust.html}),queue:{booking_id:booking.id,type:'received',channel:'email',recipient:booking.customer_email,subject:cust.subject,html:cust.html,meta:{label:'customer_email'}}}]
const settled=await Promise.allSettled(items.map(x=>x.canSend?x.task():Promise.resolve('not configured or missing')))
const statuses=settled.map((r,i)=>compact(items[i].label,r))

  // Customer: email is handled above via the items array. No email on file ->
  // hand the SMS off to staff via the two-tap automation instead of a direct
  // Twilio send.
  const customerHandoff=(!booking.customer_email&&booking.customer_phone)?await handOffSmsToOperator(booking,cust.text,'confirmation').then(()=>({ok:true})).catch(e=>({ok:false,error:e.message||String(e)})):null

  const sent=[]
if(items[0].canSend&&statuses[0].ok)sent.push(['sms',normaliseUkPhone(process.env.OPERATOR_PHONE)])
if(items[1].canSend&&statuses[1].ok)sent.push(['email',opEmail])
if(items[2].canSend&&statuses[2].ok)sent.push(['email',booking.customer_email])
if(customerHandoff&&customerHandoff.ok)sent.push(['two_tap_operator_sms','operator'])
if(sent.length)await logMany(booking.id,'received',sent)
const out=[]
for(let i=0;i<statuses.length;i++)out.push(!items[i].canSend?{...statuses[i],skipped:true}:await qfail(statuses[i],items[i].queue))
if(customerHandoff)out.push(customerHandoff.ok?{label:'customer_sms_handoff',ok:true}:{label:'customer_sms_handoff',ok:false,error:customerHandoff.error})
out.filter(s=>!s.ok&&!s.skipped).forEach(s=>console.error('Booking notification failed:',s.label,s.error))
return out
}
function ref(){return 'EVX-'+(Date.now().toString(36)+Math.random().toString(36).slice(2,6)).toUpperCase();}
function returnLegPayload(body,base,totalPrice){const airport=body.return_airport||body.airport||null;
// The return leg runs the opposite direction of the outbound leg (an
// outbound "To Airport" trip returns "From Airport", and vice versa).
const returnJourneyType=body.journey_type==='From Airport'?'To Airport':'From Airport';
return {journey_type:returnJourneyType,pickup_location:body.return_pickup||airport,airport,flight_number:body.return_flight||null,dropoff_address:body.return_destination||body.pickup_location||body.dropoff_address||null,travel_date:body.return_date||null,travel_time:body.return_time||null,passengers:parseInt(body.passengers)||1,luggage:body.luggage||null,return_journey:false,return_pickup:null,return_airport:null,return_flight:null,return_date:null,return_time:null,return_destination:null,contact_method:body.contact_method||'WhatsApp',customer_name:base.customer_name,customer_phone:base.customer_phone,customer_email:base.customer_email,user_id:base.user_id||null,status:'Unassigned',payment_status:base.payment_status||'Unpaid',quoted_price:0,payment_method:base.payment_method||null,notes:['Return leg created automatically from return booking.',totalPrice?`Original return fare: £${totalPrice}.`:null,base.ref?`Outbound ref: ${base.ref}`:null].filter(Boolean).join(' '),ref:ref()};}
async function create(req,res){if(req.method!=='POST')return j(res,405,{error:'Method not allowed'});let body;try{body=await parseBody(req);}catch{return j(res,400,{error:'Invalid request body'});}const name=(body.customer_name||'').trim(),phone=normaliseUkPhone(body.customer_phone||'');if(!name||!phone)return j(res,400,{error:'Name and phone number are required.'});const authUser=await verifyAuth(req).catch(()=>null),airport=body.airport||null,basePrice=lookupPrice(airport,Boolean(body.return_journey));const stops=Array.isArray(body.additional_stops)?body.additional_stops.filter(s=>s&&String(s).trim()):[];const totalPrice=basePrice!=null?basePrice+stops.length*5:basePrice;const booking=await dbInsert('bookings',{journey_type:body.journey_type||'To Airport',pickup_location:body.pickup_location||null,airport,flight_number:body.flight_number||null,dropoff_address:body.dropoff_address||null,travel_date:body.travel_date||null,travel_time:body.travel_time||null,passengers:parseInt(body.passengers)||1,luggage:body.luggage||null,return_journey:Boolean(body.return_journey),return_pickup:body.return_pickup||null,return_airport:body.return_airport||null,return_flight:body.return_flight||null,return_date:body.return_date||null,return_time:body.return_time||null,return_destination:body.return_destination||null,contact_method:body.contact_method||'WhatsApp',customer_name:name,customer_phone:phone,customer_email:body.customer_email?body.customer_email.trim():null,user_id:authUser?authUser.id:null,status:'Unassigned',payment_status:'Unpaid',quoted_price:totalPrice,notes:stops.length?stops.map((s,i)=>`Stop ${i+1}: ${s}`).join('\n'):null,ref:ref()});let returnBooking=null;if(body.return_journey&&body.return_date&&body.return_time){returnBooking=await dbInsert('bookings',returnLegPayload(body,booking,totalPrice));}
triggerInitialFlightVerification(booking);
if(returnBooking)triggerInitialFlightVerification(returnBooking);
const notifications=await notify({...booking,additional_stops:stops}).catch(err=>[{label:'notification_batch',ok:false,queued:false,error:err.message||String(err)}]);if(authUser)award(authUser.id).catch(err=>console.error('Privilege point error:',err));return j(res,200,{success:true,bookingId:booking.id,returnBookingId:returnBooking?returnBooking.id:null,notifications});}
async function get(req,res){const id=req.query&&req.query.id;if(!id||!isValidUUID(id))return j(res,400,{error:'Invalid booking ID'});const b=await dbGet('bookings',id);if(!b)return j(res,404,{error:'Booking not found'});const safe={};for(const k of SAFE)if(k in b)safe[k]=b[k];return j(res,200,safe);}
async function lookup(req,res){if(req.method!=='POST')return j(res,405,{error:'Method not allowed'});let body;try{body=await parseBody(req);}catch{return j(res,400,{error:'Invalid request body'});}const ref=String(body.ref||'').trim().toUpperCase();const phone=normaliseUkPhone(body.phone||'');const genericError={error:'No booking found. Check your reference and phone number and try again.'};if(!ref.startsWith('EVX-')||ref.length<7||!phone)return j(res,400,genericError);try{const b=await dbFindOne('bookings',{ref},'id,customer_phone');if(!b||normaliseUkPhone(b.customer_phone)!==phone)return j(res,404,genericError);return j(res,200,{id:b.id});}catch(err){console.error('Booking lookup error:',err);return j(res,500,genericError);}}
// notifyStatus() (formerly the /notify-status route, En Route / No Show
// customer notices via direct Twilio SMS fallback) was removed: nothing in
// any of the three repos ever called it (confirmed by repo-wide grep for
// "notify-status"), and the customer notice it existed to send is already
// covered by evexecoperator's enqueue_operator_customer_notifications() DB
// trigger, which handles En Route/Arrived/Cancelled via email or the
// two-tap handoff. Keeping dead-but-Twilio-capable code around was a
// landmine for future accidental wiring, not a live gap.
module.exports=async function handler(req,res){try{const r=route(req);if(r==='config')return config(req,res);if(r==='create')return create(req,res);if(r==='get')return get(req,res);if(r==='cancel')return handleCancel(req,res);if(r==='lookup')return lookup(req,res);return j(res,200,{ok:true,service:'booking'});}catch(err){console.error('Booking router error:',err);return j(res,500,{error:route(req)==='create'?'Failed to save booking. Please contact us directly.':'Failed to load booking'});}};