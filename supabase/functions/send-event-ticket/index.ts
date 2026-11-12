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
  // Validate the SMTP connection once before attempting recipient delivery.
  // This turns bad Gmail credentials into one actionable configuration error
  // instead of reporting the same per-recipient failure repeatedly.
  try{
   await mailer.verify();
  }catch(smtpError){
   const detail=String(smtpError instanceof Error?smtpError.message:"SMTP authentication failed");
   console.error("send-event-ticket SMTP verification failed:",detail);
   if(/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(detail)){
    return json({error:"Gmail rejected the SMTP login (535 BadCredentials). Set SMTP_USER to the sender Gmail address and SMTP_PASS to a valid 16-character Google App Password in Supabase Edge Function secrets, then redeploy this function."},503);
   }
   return json({error:"Could not connect to Gmail SMTP. Check SMTP_USER, SMTP_PASS, and Gmail SMTP access in Supabase Edge Function secrets."},503);
  }
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
   const passDigest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload));
   const passId=Array.from(new Uint8Array(passDigest)).slice(0,4).map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
   const eventTitle=String(event.title||"Kinetic Crew Event").trim()||"Kinetic Crew Event";
   const eventDate=dateLabel(event.starts_at);
   const eventTime=timeLabel(event.starts_at);
   const eventVenue=String(event.location||"To be announced");
   const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:20px 10px;background:#0b1110;font-family:Arial,Helvetica,sans-serif;color:#f4f0e5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;border-collapse:separate;border-spacing:0;background:#121b19;border:1px solid #b69a50;border-radius:24px;overflow:hidden">
<tr><td style="padding:24px 24px 20px;background:linear-gradient(120deg,#153b36,#282519);text-align:left">
<div style="font-size:10px;letter-spacing:3px;color:#d7bd75;font-weight:bold">KINETIC CREW&nbsp; / &nbsp;OFFICIAL ENTRY</div>
<div style="font-size:11px;letter-spacing:4px;color:#c7c4b4;margin-top:20px">MY TICKET</div>
<div style="font-size:27px;line-height:1.12;font-weight:700;color:#fff8e8;margin-top:8px;word-break:break-word">${esc(eventTitle)}</div>
</td></tr>
<tr><td style="padding:18px 18px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #77683c;border-radius:18px;background:#17211e">
<tr><td style="padding:14px 14px 10px;text-align:center">
<div style="font-size:10px;letter-spacing:2px;color:#d9cda9">PASS ID&nbsp; · &nbsp;${passId}</div>
</td></tr>
<tr><td style="padding:0 14px 12px;text-align:center">
<img src="cid:ticket-qr.png" width="164" height="164" alt="Personal event entry QR code" style="display:block;width:164px;height:164px;max-width:100%;margin:0 auto;background:#f3ecd9;border:7px solid #302b1b;border-radius:12px">
<div style="font-size:9px;letter-spacing:2px;color:#b8c0b5;margin-top:10px">SCAN AT THE EVENT ENTRANCE</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 20px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
<tr><td width="50%" valign="top" style="padding:0 8px 15px 0"><div style="font-size:9px;letter-spacing:2px;color:#aeb4a8">NAME</div><div style="font-size:14px;line-height:1.4;font-weight:bold;color:#f4f0e5;padding-top:5px">${esc(recipient.name)}</div></td>
<td width="50%" valign="top" style="padding:0 0 15px 8px"><div style="font-size:9px;letter-spacing:2px;color:#aeb4a8">DATE</div><div style="font-size:14px;line-height:1.4;font-weight:bold;color:#f4f0e5;padding-top:5px">${esc(eventDate)}</div></td></tr>
<tr><td width="50%" valign="top" style="padding:0 8px 10px 0"><div style="font-size:9px;letter-spacing:2px;color:#aeb4a8">VENUE</div><div style="font-size:14px;line-height:1.4;font-weight:bold;color:#f4f0e5;padding-top:5px">${esc(eventVenue)}</div></td>
<td width="50%" valign="top" style="padding:0 0 10px 8px"><div style="font-size:9px;letter-spacing:2px;color:#aeb4a8">TIME</div><div style="font-size:14px;line-height:1.4;font-weight:bold;color:#f4f0e5;padding-top:5px">${esc(eventTime)}</div></td></tr>
</table>
</td></tr>
<tr><td style="padding:0 20px 18px"><div style="border-top:1px dashed #777b68;padding-top:12px;font-size:10px;letter-spacing:1px;color:#c5c6b8">● VALID PERSONAL PASS <span style="float:right">ONE MEMBER · ONE QR</span></div></td></tr>
<tr><td style="padding:0 20px 22px">
<div style="font-size:17px;font-weight:bold;color:#dfc477;margin-bottom:8px">${esc(greeting)}</div>
<div style="font-size:13px;line-height:1.65;color:#d0d3c8;white-space:pre-line">${esc(message)}</div>
<div style="font-size:12px;line-height:1.5;color:#b9b9a9;margin-top:12px">${esc(footer)}</div>
<div style="border-top:1px solid #ffffff22;margin-top:20px;padding-top:14px;text-align:center;font-size:9px;letter-spacing:3px;color:#9ba79e">KINETIC CREW&nbsp; · &nbsp;BUILT TO MOVE TOGETHER</div>
</td></tr></table>
</td></tr></table></body></html>`;
   try{
    await mailer.sendMail({from:'"KINETIC CREW" <'+smtpUser+'>',to:recipient.email,subject,html,attachments:[{filename:"kinetic-crew-ticket-qr.png",content:qrBase64,encoding:"base64",cid:"ticket-qr.png"}]});
    sendResults.push({email:recipient.email,ok:true});
   }catch(mailError){const reason=String(mailError instanceof Error?mailError.message:"SMTP delivery failed").slice(0,240);console.error("send-event-ticket SMTP failure for",recipient.email,reason);sendResults.push({email:recipient.email,ok:false,error:reason});}
  }
  return json({ok:true,sent:sendResults.filter(x=>x.ok).length,failed:sendResults.filter(x=>!x.ok).length,results:sendResults});
 }catch(error){console.error("send-event-ticket:",error);return json({error:error instanceof Error?error.message:"Ticket email failed."},500);}
});
