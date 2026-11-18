import http from 'node:http';
const PORT=Number(process.env.PORT||10000);
const ORIGIN='https://luciandemar.co';
const TO='calibrationcorp.network@gmail.com';
const allowedOrigins = new Set([ORIGIN, 'https://www.luciandemar.co', 'https://lucian-demarco-portfolio.onrender.com']);
const hits=new Map();
const visitHits=new Map();
const deliveredVisits=new Map();
const visitDestinations = new Set(["Home","Selected work","Ventures","My story","Contact overview","Simple Arch Studios practice","Project gallery","Contact and scheduling","Simple Arch Studios","OnlyDecks","NJ Green Dash","Calibration Network","GridMint Digital Studio","Calibration Architecture","Sacred Atlas","Maddy’s Cleaning Service","Scheduling"]);
const escape=(s)=>String(s||'').replace(/[\r\n]+/g,' ').trim();
function reply(res,status,obj,origin){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))}
async function gmailSend({subject,body,replyTo}){
 const replyHeader = replyTo ? ['Reply-To: '+escape(replyTo).replace(/[<>]/g,'')] : [];
 const cfg=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];
 if(cfg.some(k=>!process.env[k]))throw new Error('not_configured');
 const form=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:process.env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
 if(!auth.ok)throw new Error('oauth_failed');
 const token=(await auth.json()).access_token;
 const raw=['From: '+TO,'To: '+TO,...replyHeader,'Subject: '+subject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',''+body].join('\r\n');
 const encoded=Buffer.from(raw,'utf8').toString('base64url');
 const send=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:encoded})});
 if(!send.ok)throw new Error('gmail_send_failed');
}
http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 const allowedOrigin = allowedOrigins.has(origin) ? origin : ORIGIN;
 if(req.url==='/health'){return reply(res,200,{ok:true,configured:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'].every(k=>Boolean(process.env[k]))},allowedOrigin)}
 if(req.url==='/health/oauth'){
  if(!['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'].every(k=>Boolean(process.env[k])))return reply(res,503,{ok:false,stage:'configuration',error:'OAuth environment values missing'},ORIGIN);
  try{
   const form=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:process.env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
   const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
   if(!response.ok){
    const payload=await response.json().catch(()=>({}));
    const allowedErrors=['invalid_client','invalid_grant','invalid_request','unauthorized_client','unsupported_grant_type','invalid_scope'];
    const providerError=allowedErrors.includes(payload?.error)?payload.error:'unknown';
    console.error('OAuth validation failed, HTTP',response.status,providerError);
    return reply(res,503,{ok:false,stage:'google_authorization',error:'Google rejected OAuth credentials or refresh token',providerError},ORIGIN);
   }
   return reply(res,200,{ok:true,stage:'google_authorization',message:'Google issued an access token. Gmail delivery not yet tested.'},ORIGIN);
  }catch{ return reply(res,503,{ok:false,stage:'network',error:'Unable to contact Google OAuth'},ORIGIN)}
 }
 const isVisit = req.url === '/api/visit';
 if(req.url!=='/api/contact'&&!isVisit){return reply(res,404,{error:'Not found'},ORIGIN)}
 if(!allowedOrigins.has(origin)){return reply(res,403,{error:'Origin not allowed'},ORIGIN)}
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600'});return res.end()}
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'},origin);
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 const buckets = isVisit ? visitHits : hits;
 const now=Date.now();const recent=(buckets.get(ip)||[]).filter(t=>now-t<3600000);
 if(recent.length>=8)return reply(res,429,{error:'Too many requests'},origin);
 recent.push(now);buckets.set(ip,recent);if(buckets.size>5000)buckets.clear();
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)return reply(res,413,{error:'Message too long'},origin)}
 let d;try{d=JSON.parse(raw)}catch{return reply(res,400,{error:'Invalid request'},origin)}
 if(!d || typeof d !== 'object')return reply(res,400,{error:'Invalid request'},origin);
 if(isVisit){
  const {visitId,seconds,trail}=d;
  if(typeof visitId!=='string'||!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(visitId)||
     !Number.isInteger(seconds)||seconds<0||seconds>86400||
     !Array.isArray(trail)||trail.length>visitDestinations.size||
     !trail.every(item=>visitDestinations.has(item))){
   return reply(res,400,{error:'Invalid visit summary'},origin);
  }
  for(const [id,expires] of deliveredVisits) if(expires<=now)deliveredVisits.delete(id);
  if(deliveredVisits.has(visitId))return reply(res,200,{ok:true},origin);
  if(deliveredVisits.size>=10000)return reply(res,429,{error:'Too many requests'},origin);
  deliveredVisits.set(visitId,now+86400000);
  try{
   const destinations=[...new Set(trail)].join(' → ');
   await gmailSend({
    subject:'Portfolio: new visitor summary',
    body:'Website: luciandemar.co\nActive time: '+seconds+' seconds\nNavigation: '+destinations
   });
   return reply(res,200,{ok:true},origin);
  }catch(e){
   deliveredVisits.delete(visitId);
   console.error('Visit summary delivery error:',e.message);
   return reply(res,503,{error:'Summary delivery unavailable'},origin);
  }
 }
 if(d.website)return reply(res,200,{ok:true},origin);
 const name=escape(d.name).slice(0,120),email=escape(d.email).slice(0,200),phone=escape(d.phone).slice(0,60),topic=escape(d.topic).slice(0,150),message=String(d.message||'').trim().slice(0,6000),type=['contact','chat','newsletter'].includes(d.type)?d.type:'contact';
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||!message)return reply(res,400,{error:'Name, valid email, and message required'},origin);
 if(type==='newsletter'&&!d.consent)return reply(res,400,{error:'Subscription consent required'},origin);
 try{await gmailSend({
  subject:'Website '+type+': '+escape(name).slice(0,100),
  replyTo:email,
  body:['Website: luciandemar.co','Type: '+type,'Name: '+name,'Email: '+email,'Phone: '+phone,'Topic: '+topic,'Consent: '+Boolean(d.consent),'','Message:',message].join('\n')
 });return reply(res,200,{ok:true},origin)}
 catch(e){console.error('Contact send error:',e.message);return reply(res,503,{error:'Message delivery is temporarily unavailable. Please try again shortly.'},origin)}
}).listen(PORT,'0.0.0.0',()=>console.log('Contact API listening'));
