import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";
import nodemailer from "npm:nodemailer@6.9.16";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const dateLabel=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"To be announced":d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"});};
const timeLabel=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"To be announced":d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"});};

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const auth=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:{user},error:authError}=await userClient.auth.getUser();
 if(authError||!user)return json({error:"Sign in required."},401);
 const adminClient=createClient(url,service);
 const {data:operator,error:roleError}=await adminClient.from("crew_profiles").select("auth_id,role,name").eq("auth_id",user.id).maybeSingle();
 if(roleError||!operator||!["admin","super_admin"].includes(operator.role))return json({error:"Admin access required."},403);
 const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com",smtpPass=Deno.env.get("SMTP_PASS");
 if(!smtpPass)return json({error:"Gmail SMTP is not connected to the ticket sender yet. Add SMTP_PASS as a Supabase Edge Function secret. SMTP_USER defaults to kineticcreww@gmail.com."},503);
 const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
 try{
  const body=await req.json(),eventId=String(body.eventId||"");
  const subject=String(body.subject||"").trim().slice(0,140);
  const greeting=String(body.greeting||"Your Kinetic Crew pass is ready").trim().slice(0,120);
  const message=String(body.message||"Keep this ticket ready and show its QR code at the event entrance.").trim().slice(0,1200);
  const footer=String(body.footer||"We look forward to seeing you there.").trim().slice(0,300);
  const recipientMode=body.recipientMode==="single"?"single":"all";
  const singleEmail=String(body.email||"").trim().toLowerCase();
  if(!eventId||!subject||!greeting||!message)return json({error:"Event, subject, greeting and message are required."},400);
  const {data:event,error:eventError}=await adminClient.from("crew_events").select("id,title,description,location,starts_at").eq("id",eventId).maybeSingle();
  if(eventError||!event)return json({error:"Event not found."},404);
  let query=adminClient.from("crew_registrations").select("member_id,crew_profiles!inner(auth_id,name,email)").eq("event_id",eventId);
  const {data:registrations,error:regError}=await query;
  if(regError)throw regError;
  let recipients=(registrations||[]).map((r:any)=>({id:r.member_id,name:r.crew_profiles?.name||"Crew member",email:String(r.crew_profiles?.email||"").trim().toLowerCase()})).filter((r:any)=>r.email);
  if(recipientMode==="single"){
   if(!singleEmail||!/^\S+@\S+\.\S+$/.test(singleEmail))return json({error:"Enter a valid registered member email."},400);
   recipients=recipients.filter((r:any)=>r.email===singleEmail);
   if(!recipients.length)return json({error:"That email is not registered for this event."},404);
  }
  if(!recipients.length)return json({error:"No registered members with email addresses were found."},404);
  if(recipients.length>500)return json({error:"This event has more than 500 recipients. Send in smaller batches."},400);
  const sendResults=[];
  for(const recipient of recipients){
   const payload="KC_EVENT_ATTENDANCE:"+eventId+":"+recipient.email;
   const qrDataUrl=await QRCode.toDataURL(payload,{width:360,margin:2,color:{dark:"#17201d",light:"#f3ecd9"},errorCorrectionLevel:"M"});
   const qrBase64=qrDataUrl.split(",")[1];
   const passId=String(event.id).replace(/-/g,"").slice(-8).toUpperCase();
   const html=`<!doctype html><html><body style="margin:0;padding:28px 12px;background:#111715;font-family:Arial,sans-serif;color:#f5efdf"><div style="max-width:560px;margin:auto;border:1px solid #b79a4c;border-radius:24px;overflow:hidden;background:linear-gradient(145deg,#202722,#111715)"><div style="padding:30px 24px;text-align:center;background:linear-gradient(120deg,#143e39,#40331a)"><div style="font-size:11px;letter-spacing:4px;color:#e6c66c;font-weight:bold">KINETIC CREW · OFFICIAL PASS</div><div style="font-size:12px;letter-spacing:3px;color:#c9c2ae;margin-top:22px">MY TICKET</div><h1 style="font-size:30px;line-height:1.15;margin:12px 0 0;color:#fff8e8">${esc(event.title)}</h1></div><div style="margin:22px 22px 0;padding:18px;border:1px solid #b99c50;border-radius:18px;text-align:center;background:#17201d"><div style="font-size:11px;letter-spacing:2px;color:#d8cba9">PASS ID · ${passId}</div><div style="border-top:1px dashed #c8b987;margin:16px 0"></div><img src="cid:ticket-qr.png" width="220" height="220" alt="Event entry QR code" style="display:block;width:220px;height:220px;margin:auto;background:#f3ecd9;border-radius:10px;padding:8px"><div style="font-size:9px;letter-spacing:2px;color:#aab5a8;margin-top:12px">SCAN AT THE EVENT ENTRANCE</div></div><div style="padding:25px 28px;display:grid;grid-template-columns:1fr 1fr;gap:18px"><div><div style="font-size:10px;letter-spacing:2px;color:#aaa99c">NAME</div><b style="display:block;margin-top:7px">${esc(recipient.name)}</b></div><div><div style="font-size:10px;letter-spacing:2px;color:#aaa99c">DATE</div><b style="display:block;margin-top:7px">${esc(dateLabel(event.starts_at))}</b></div><div><div style="font-size:10px;letter-spacing:2px;color:#aaa99c">VENUE</div><b style="display:block;margin-top:7px">${esc(event.location||"To be announced")}</b></div><div><div style="font-size:10px;letter-spacing:2px;color:#aaa99c">TIME</div><b style="display:block;margin-top:7px">${esc(timeLabel(event.starts_at))}</b></div></div><div style="padding:0 26px 22px"><div style="border-top:1px dashed #8e907f;padding-top:15px;font-size:12px;color:#b9b9a9">● VALID PASS <span style="float:right">UNIQUE TO YOUR ACCOUNT</span></div></div><div style="padding:0 26px 28px"><h2 style="font-size:19px;color:#e9c76b">${esc(greeting)}</h2><p style="font-size:14px;line-height:1.65;color:#d0d0c5;white-space:pre-line">${esc(message)}</p><p style="font-size:13px;color:#bcb8a8">${esc(footer)}</p><div style="margin-top:24px;padding-top:16px;border-top:1px solid #ffffff22;text-align:center;color:#8d9a90;font-size:10px;letter-spacing:3px">KINETIC CREW · BUILT TO MOVE TOGETHER</div></div></div></body></html>`;
   try{
    await mailer.sendMail({from:'"KINETIC CREW" <kineticcreww@gmail.com>',to:recipient.email,subject,html,attachments:[{filename:"kinetic-crew-ticket-qr.png",content:qrBase64,encoding:"base64",cid:"ticket-qr.png"}]});
    sendResults.push({email:recipient.email,ok:true});
   }catch(mailError){const reason=String(mailError instanceof Error?mailError.message:"SMTP delivery failed").slice(0,240);console.error("send-event-ticket SMTP failure for",recipient.email,reason);sendResults.push({email:recipient.email,ok:false,error:reason});}
  }
  return json({ok:true,sent:sendResults.filter(x=>x.ok).length,failed:sendResults.filter(x=>!x.ok).length,results:sendResults});
 }catch(error){console.error("send-event-ticket:",error);return json({error:error instanceof Error?error.message:"Ticket email failed."},500);}
});
