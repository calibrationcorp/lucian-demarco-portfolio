import http from 'node:http';
import crypto from 'node:crypto';
const PORT=Number(process.env.PORT||10000);
const ORIGIN='https://luciandemar.co';
const TO='calibrationcorp.network@gmail.com';
const CC='luciandemarco@icloud.com';
const hits=new Map();
const escape=(s)=>String(s||'').replace(/[\r\n]+/g,' ').trim();
function reply(res,status,obj,origin){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))}
async function gmailSend({name,email,phone,topic,message,consent,type}){
 const cfg=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];
 if(cfg.some(k=>!process.env[k]))throw new Error('not_configured');
 const form=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:process.env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
 if(!auth.ok)throw new Error('oauth_failed');
 const token=(await auth.json()).access_token;
 const body=['Website: luciandemar.co','Type: '+type,'Name: '+name,'Email: '+email,'Phone: '+phone,'Topic: '+topic,'Consent: '+consent,'','Message:',message].join('\n');
 const subject='Website '+type+': '+escape(name).slice(0,100);
 const safe=(s)=>escape(s).replace(/[<>]/g,'');
 const raw=['From: '+TO,'To: '+TO,'Cc: '+CC,'Reply-To: '+safe(email),'Subject: '+subject,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','',''+body].join('\r\n');
 const encoded=Buffer.from(raw,'utf8').toString('base64url');
 const send=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({raw:encoded})});
 if(!send.ok)throw new Error('gmail_send_failed');
}
http.createServer(async(req,res)=>{
 const origin=req.headers.origin||'';
 if(req.url==='/health'){return reply(res,200,{ok:true,configured:['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'].every(k=>Boolean(process.env[k]))},origin===ORIGIN?origin:ORIGIN)}
 if(req.url==='/health/oauth'){
  if(!['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'].every(k=>Boolean(process.env[k])))return reply(res,503,{ok:false,stage:'configuration',error:'OAuth environment values missing'},ORIGIN);
  try{
   const form=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:process.env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'});
   const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form});
   if(!response.ok){console.error('OAuth validation failed, HTTP',response.status);return reply(res,503,{ok:false,stage:'google_authorization',error:'Google rejected OAuth credentials or refresh token'},ORIGIN)}
   return reply(res,200,{ok:true,stage:'google_authorization',message:'Google issued an access token. Gmail delivery not yet tested.'},ORIGIN);
  }catch{ return reply(res,503,{ok:false,stage:'network',error:'Unable to contact Google OAuth'},ORIGIN)}
 }
 if(req.url!=='/api/contact'){return reply(res,404,{error:'Not found'},ORIGIN)}
 if(origin!==ORIGIN){return reply(res,403,{error:'Origin not allowed'},ORIGIN)}
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'3600'});return res.end()}
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'},ORIGIN);
 const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
 const now=Date.now();const recent=(hits.get(ip)||[]).filter(t=>now-t<3600000);
 if(recent.length>=8)return reply(res,429,{error:'Too many requests'},ORIGIN);
 recent.push(now);hits.set(ip,recent);if(hits.size>5000)hits.clear();
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)return reply(res,413,{error:'Message too long'},ORIGIN)}
 let d;try{d=JSON.parse(raw)}catch{return reply(res,400,{error:'Invalid request'},ORIGIN)}
 if(d.website)return reply(res,200,{ok:true},ORIGIN);
 const name=escape(d.name).slice(0,120),email=escape(d.email).slice(0,200),phone=escape(d.phone).slice(0,60),topic=escape(d.topic).slice(0,150),message=String(d.message||'').trim().slice(0,6000),type=['contact','chat','newsletter'].includes(d.type)?d.type:'contact';
 if(!name||!/^\S+@\S+\.\S+$/.test(email)||!message)return reply(res,400,{error:'Name, valid email, and message required'},ORIGIN);
 if(type==='newsletter'&&!d.consent)return reply(res,400,{error:'Subscription consent required'},ORIGIN);
 try{await gmailSend({name,email,phone,topic,message,consent:Boolean(d.consent),type});return reply(res,200,{ok:true},ORIGIN)}
 catch(e){console.error('Contact send error:',e.message);return reply(res,503,{error:'Message delivery is not yet available. Please use the contact email link.'},ORIGIN)}
}).listen(PORT,'0.0.0.0',()=>console.log('Contact API listening'));
