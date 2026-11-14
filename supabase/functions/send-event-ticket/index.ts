import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";
import nodemailer from "npm:nodemailer@6.9.16";
import { brandedEmail } from "../_shared/email-template.ts";

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
 const {data:operator,error:roleError}=await adminClient.from("crew_profiles").select("auth_id,role,name,email").eq("auth_id",user.id).maybeSingle();
 const isAdmin=!!operator&&["admin","super_admin"].includes(operator.role);
 const body=await req.json(),eventId=String(body.eventId||""),autoRegistration=body.autoRegistration===true;
 if(roleError||!operator)return json({error:"Crew profile not found."},403);
 if(!isAdmin&&!autoRegistration)return json({error:"Admin access required."},403);
 if(!eventId)return json({error:"Event is required."},400);
 const {data:event,error:eventError}=await adminClient.from("crew_events").select("id,title,description,location,starts_at,ticket_email_enabled").eq("id",eventId).maybeSingle();
 if(eventError||!event)return json({error:"Event not found."},404);
 if(autoRegistration&&!event.ticket_email_enabled)return json({error:"Automatic ticket email is not enabled for this event."},403);
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
  const greeting="Your Kinetic Crew pass is ready";
  const message="Keep this personal ticket ready and show its QR code at the event entrance. Each QR code is unique to its registered member.";
  const footer="We look forward to seeing you there. · KINETIC CREW";
  const recipientMode=body.recipientMode==="single"?"single":"all";
  const singleEmail=String(body.email||"").trim().toLowerCase();
  let query=adminClient.from("crew_registrations").select("member_id,crew_profiles!inner(auth_id,name,email)").eq("event_id",eventId);
  const {data:registrations,error:regError}=await query;
  if(regError)throw regError;
  let recipients=(registrations||[]).map((r:any)=>({id:r.member_id,name:r.crew_profiles?.name||"Crew member",email:String(r.crew_profiles?.email||"").trim().toLowerCase()})).filter((r:any)=>r.email);
  if(autoRegistration){
   if(!registrations?.some((r:any)=>String(r.member_id)===String(user.id)))return json({error:"Register for this event before requesting its ticket."},403);
   recipients=recipients.filter((r:any)=>String(r.id)===String(user.id));
   if(!recipients.length)return json({error:"Your registered email address could not be found."},404);
  }else if(recipientMode==="single"){
   if(!singleEmail||!/^\S+@\S+\.\S+$/.test(singleEmail))return json({error:"Enter a valid registered member email."},400);
   recipients=recipients.filter((r:any)=>r.email===singleEmail);
   if(!recipients.length)return json({error:"That email is not registered for this event."},404);
  }
  if(!recipients.length)return json({error:"No registered members with email addresses were found."},404);
  if(recipients.length>500)return json({error:"This event has more than 500 recipients. Send in smaller batches."},400);
  const sendResults=[];
  for(const recipient of recipients){
   const deliveryKey=autoRegistration?"event-ticket-registration:"+eventId:"";
   if(deliveryKey){
    const {data:prior,error:priorError}=await adminClient.from("crew_email_delivery_log").select("status").eq("idempotency_key",deliveryKey).eq("recipient_email",recipient.email).maybeSingle();
    if(priorError)throw priorError;
    if(prior?.status==="sent"){sendResults.push({email:recipient.email,ok:true,alreadySent:true});continue;}
    const {error:claimError}=await adminClient.from("crew_email_delivery_log").insert({idempotency_key:deliveryKey,recipient_email:recipient.email,status:"sending"});
    if(claimError){
     if(claimError.code==="23505"){sendResults.push({email:recipient.email,ok:false,error:"Ticket email is already being processed."});continue;}
     throw claimError;
    }
   }
   const payload="KC_EVENT_ATTENDANCE:"+eventId+":"+recipient.email;
   const qrDataUrl=await QRCode.toDataURL(payload,{width:360,margin:2,color:{dark:"#17201d",light:"#f3ecd9"},errorCorrectionLevel:"M"});
   const qrBase64=qrDataUrl.split(",")[1];
   const passDigest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload));
   const passId=Array.from(new Uint8Array(passDigest)).slice(0,4).map(v=>v.toString(16).padStart(2,"0")).join("").toUpperCase();
   const eventTitle=String(event.title||"Kinetic Crew Event").trim()||"Kinetic Crew Event";
   const subject="Your "+eventTitle+" ticket · Kinetic Crew";
   const eventDate=dateLabel(event.starts_at);
   const eventTime=timeLabel(event.starts_at);
   const eventVenue=String(event.location||"To be announced");
   const html=brandedEmail({
    eyebrow:"OFFICIAL EVENT ENTRY",
    title:"Your event ticket",
    subtitle:eventTitle,
    contentHtml:'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #77616a;border-radius:18px;background:#20212a;"><tr><td align="center" style="padding:15px 14px 10px;"><div style="font-size:10px;letter-spacing:2px;color:#ffad7c;">PASS ID · '+passId+'</div></td></tr><tr><td align="center" style="padding:0 14px 15px;"><img src="cid:ticket-qr.png" width="164" height="164" alt="Personal event entry QR code" style="display:block;width:164px;height:164px;max-width:100%;margin:0 auto;background:#fff;border:7px solid #302b1b;border-radius:12px;"><div style="font-size:9px;letter-spacing:2px;color:#c2bec8;margin-top:10px;">SCAN AT THE EVENT ENTRANCE</div></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;"><tr><td width="50%" valign="top" style="padding:0 8px 14px 0;"><div style="font-size:9px;letter-spacing:2px;color:#aaa5b1;">NAME</div><div style="font-size:14px;font-weight:bold;color:#f4f0e5;padding-top:5px;">'+esc(recipient.name)+'</div></td><td width="50%" valign="top" style="padding:0 0 14px 8px;"><div style="font-size:9px;letter-spacing:2px;color:#aaa5b1;">DATE</div><div style="font-size:14px;font-weight:bold;color:#f4f0e5;padding-top:5px;">'+esc(eventDate)+'</div></td></tr><tr><td width="50%" valign="top" style="padding:0 8px 12px 0;"><div style="font-size:9px;letter-spacing:2px;color:#aaa5b1;">VENUE</div><div style="font-size:14px;font-weight:bold;color:#f4f0e5;padding-top:5px;">'+esc(eventVenue)+'</div></td><td width="50%" valign="top" style="padding:0 0 12px 8px;"><div style="font-size:9px;letter-spacing:2px;color:#aaa5b1;">TIME</div><div style="font-size:14px;font-weight:bold;color:#f4f0e5;padding-top:5px;">'+esc(eventTime)+'</div></td></tr></table><div style="border-top:1px dashed #777b82;padding-top:12px;font-size:10px;letter-spacing:1px;color:#d0cbd4;">VALID PERSONAL PASS · ONE MEMBER · ONE QR</div><h2 style="font-size:17px;color:#ffad7c;margin:20px 0 8px;">'+esc(greeting)+'</h2><p style="font-size:13px;line-height:1.65;color:#e0dce4;white-space:pre-line;">'+esc(message)+'</p><p style="font-size:12px;line-height:1.5;color:#b9b4bf;margin-top:12px;">'+esc(footer)+'</p><p style="font-size:13px;line-height:1.65;color:#c2bec8;margin-top:16px;"><b>Event details:</b><br>'+esc(event.description||"See your Kinetic Crew event page for the latest details.")+'</p>',
    footerNote:"Keep this ticket available on your phone and present the QR code at the event entrance."
   });

   try{
    await mailer.sendMail({from:'"KINETIC CREW" <'+smtpUser+'>',to:recipient.email,subject,html,attachments:[{filename:"kinetic-crew-ticket-qr.png",content:qrBase64,encoding:"base64",cid:"ticket-qr.png"}]});
    if(deliveryKey){
     const {error:logError}=await adminClient.from("crew_email_delivery_log").update({status:"sent",sent_at:new Date().toISOString()}).eq("idempotency_key",deliveryKey).eq("recipient_email",recipient.email);
     if(logError)console.error("Ticket delivery log update failed:",logError.message);
    }
    sendResults.push({email:recipient.email,ok:true});
   }catch(mailError){
    const reason=String(mailError instanceof Error?mailError.message:"SMTP delivery failed").slice(0,240);
    console.error("send-event-ticket SMTP failure for",recipient.email,reason);
    if(deliveryKey){await adminClient.from("crew_email_delivery_log").delete().eq("idempotency_key",deliveryKey).eq("recipient_email",recipient.email);}
    sendResults.push({email:recipient.email,ok:false,error:reason});
   }
  }
  return json({ok:true,sent:sendResults.filter(x=>x.ok&&!x.alreadySent).length,alreadySent:sendResults.filter(x=>x.alreadySent).length,failed:sendResults.filter(x=>!x.ok).length,results:sendResults});
 }catch(error){console.error("send-event-ticket:",error);return json({error:error instanceof Error?error.message:"Ticket email failed."},500);}
});
