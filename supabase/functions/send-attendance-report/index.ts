import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { brandedEmail } from "./email-template.ts";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { Buffer } from "node:buffer";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type":"application/json" } });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]!));
const dateLabel = (v: string) => { const d=new Date(v); return Number.isNaN(d.getTime())?"To be announced":d.toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric",timeZone:"Asia/Kolkata"}); };
const timeLabel = (v: string) => { const d=new Date(v); return Number.isNaN(d.getTime())?"To be announced":d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit",timeZone:"Asia/Kolkata"}); };
const stampLabel = (v?: string|null) => { if(!v)return "Not recorded"; const d=new Date(v); return Number.isNaN(d.getTime())?"Not recorded":d.toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Kolkata"}); };
const safePdf = (v: unknown) => String(v ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g,"?");
const statusLabel = (s: string) => ({present:"Present",absent:"Absent",pending:"Pending",not_attending:"Not attending"}[s]||"Pending");
const hex = (v: string) => { const n=v.replace("#",""); return rgb(parseInt(n.slice(0,2),16)/255,parseInt(n.slice(2,4),16)/255,parseInt(n.slice(4,6),16)/255); };

async function buildPdf(event: any, rows: any[], stats: any, scope: "complete"|"personal", preparedBy: string) {
 const pdf=await PDFDocument.create();
 pdf.setTitle((scope==="complete"?"Attendance Report - ":"Personal Attendance - ")+event.title);
 pdf.setAuthor("KINETIC CREW");
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,H=841.89,margin=42,ink=hex("#29292d"),muted=hex("#77747e"),purple=hex("#43105f"),magenta=hex("#b51c62"),pink=hex("#e34b86"),white=hex("#ffffff"),paper=hex("#f1eff3"),soft=hex("#e8e3eb");
 const safe=(v:unknown)=>safePdf(v);
 const fit=(v:unknown,font:any,size:number,width:number)=>{let t=safe(v);while(t.length>2&&font.widthOfTextAtSize(t,size)>width)t=t.slice(0,-2)+"...";return t;};
 const line=(page:any,x1:number,y1:number,x2:number,y2:number,color:any,thickness=0.65,opacity=0.8)=>page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},color,thickness,opacity});
 function pattern(page:any,top:number,bottom:number){
  // Interlaced geometric line field inspired by the supplied purple/magenta brochure.
  for(let i=-12;i<34;i++){
   const x=i*24;
   line(page,x,top,x+230,bottom,purple,0.75,0.88);
   line(page,x+220,top,x,bottom,magenta,0.75,0.72);
  }
  for(let i=0;i<9;i++){
   const inset=i*9;
   line(page,18+inset,top-8,220+inset,bottom+8,pink,0.45,0.5);
   line(page,W-18-inset,top-8,W-220-inset,bottom+8,magenta,0.45,0.5);
  }
 }
 function basePage(first:boolean){
  const page=pdf.addPage([W,H]);
  page.drawRectangle({x:0,y:0,width:W,height:H,color:paper});
  page.drawRectangle({x:0,y:H-252,width:W,height:252,color:purple});
  pattern(page,H-12,H-252);
  page.drawRectangle({x:28,y:H-218,width:W-56,height:156,color:ink,borderColor:magenta,borderWidth:2});
  page.drawRectangle({x:36,y:H-210,width:W-72,height:140,borderColor:hex("#5d5962"),borderWidth:0.7});
  page.drawText("KINETIC CREW",{x:54,y:H-98,size:9,font:bold,color:pink,characterSpacing:2});
  page.drawText(first?(scope==="complete"?"ATTENDANCE REPORT":"PERSONAL ATTENDANCE"):"ATTENDANCE REPORT",{x:54,y:H-140,size:23,font:bold,color:white});
  page.drawText("OFFICIAL CREW RECORD",{x:55,y:H-164,size:8,font:bold,color:hex("#c7bdcb"),characterSpacing:1.5});
  page.drawRectangle({x:0,y:0,width:W,height:78,color:ink});
  pattern(page,70,10);
  page.drawRectangle({x:28,y:17,width:W-56,height:43,color:ink,borderColor:magenta,borderWidth:0.8});
  page.drawText("KINETIC CREW  /  "+(first?"OFFICIAL DOCUMENT":"ATTENDANCE CONTINUED"),{x:42,y:34,size:7,font:bold,color:hex("#e5dce8"),characterSpacing:0.7});
  page.drawText("Generated "+stampLabel(new Date().toISOString()),{x:W-208,y:34,size:6.5,font:regular,color:hex("#c1b9c7")});
  return page;
 }
 let page=basePage(true),y=H-292;
 const eventTitle=fit(event.title,bold,16,W-2*margin);
 page.drawText(eventTitle,{x:margin,y,size:16,font:bold,color:ink});y-=21;
 page.drawText("Date: "+dateLabel(event.starts_at)+"    Time: "+timeLabel(event.starts_at),{x:margin,y,size:9,font:regular,color:muted});y-=15;
 page.drawText("Venue: "+fit(event.location||"To be announced",regular,9,W-2*margin),{x:margin,y,size:9,font:regular,color:muted});y-=30;
 page.drawRectangle({x:margin,y:y-62,width:W-2*margin,height:76,color:ink,borderColor:magenta,borderWidth:1});
 const statsList=[["REGISTERED",stats.total],["PRESENT",stats.present],["ABSENT",stats.absent],["PENDING",stats.pending],["NOT ATTENDING",stats.notAttending]],bw=(W-2*margin)/5;
 statsList.forEach((it,i)=>{const x=margin+i*bw+8;if(i>0)line(page,margin+i*bw,y-50,margin+i*bw,y+4,hex("#55515b"),0.7);page.drawText(String(it[1]),{x,y:y-12,size:18,font:bold,color:pink});page.drawText(it[0],{x,y:y-34,size:5.8,font:bold,color:hex("#d5cbd8")});});
 y-=100;
 page.drawText(scope==="complete"?"REGISTERED MEMBER ATTENDANCE":"YOUR EVENT STATUS",{x:margin,y,size:9,font:bold,color:magenta,characterSpacing:1});y-=19;
 const tableHead=()=>{page.drawRectangle({x:margin,y:y-8,width:W-2*margin,height:25,color:ink});page.drawText("MEMBER NAME",{x:margin+8,y:y,size:7,font:bold,color:white});page.drawText("ATTENDANCE STATUS",{x:margin+252,y:y,size:7,font:bold,color:white});page.drawText("CHECK-IN TIME",{x:margin+372,y:y,size:7,font:bold,color:white});y-=26;};
 tableHead();
 for(let i=0;i<rows.length;i++){
  if(y<105){page=basePage(false);y=H-292;page.drawText("ATTENDANCE RECORDS",{x:margin,y,size:9,font:bold,color:magenta,characterSpacing:1});y-=20;tableHead();}
  const row=rows[i];
  if(i%2===0)page.drawRectangle({x:margin,y:y-8,width:W-2*margin,height:23,color:soft});
  page.drawText(fit(row.name||"Crew member",regular,8.2,230),{x:margin+8,y,size:8.2,font:regular,color:ink});
  const present=row.status==="present";
  page.drawText(statusLabel(row.status).toUpperCase(),{x:margin+252,y,size:7.5,font:bold,color:present?hex("#277c62"):muted});
  page.drawText(fit(stampLabel(row.marked_at),regular,7.2,125),{x:margin+372,y,size:7.2,font:regular,color:muted});
  y-=23;
 }
 if(y<100){page=basePage(false);y=H-292;}
 y-=8;
 page.drawRectangle({x:margin,y:y-37,width:W-2*margin,height:42,color:ink,borderColor:magenta,borderWidth:0.8});
 page.drawText("PREPARED BY",{x:margin+10,y:y-12,size:6.5,font:bold,color:pink,characterSpacing:1});
 page.drawText(fit(preparedBy,regular,8,W-2*margin-20),{x:margin+10,y:y-27,size:8,font:regular,color:white});
 return await pdf.save();
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!service)return json({error:"Supabase function secrets are incomplete."},503);
  const auth=req.headers.get("Authorization")||"",userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await userClient.auth.getUser();
  if(authError||!user)return json({error:"Sign in required."},401);
  const db=createClient(url,service);
  const {data:profile,error:profileError}=await db.from("crew_profiles").select("auth_id,role,name,email").eq("auth_id",user.id).maybeSingle();
  if(profileError||!profile)return json({error:"Crew profile not found."},403);
  const role=String(profile.role||"");
  if(!["member","admin","super_admin"].includes(role))return json({error:"Your role cannot request attendance reports."},403);
  const body=await req.json(),eventId=String(body.eventId||"").trim();
  const ownEmail=String(user.email||profile.email||"").trim().toLowerCase(),requestedEmail=String(body.toEmail||"").trim().toLowerCase();
  const recipientEmail=role==="member"?ownEmail:requestedEmail;
  if(!recipientEmail||! /^\S+@\S+\.\S+$/.test(recipientEmail))return json({error:role==="member"?"Your authenticated account does not have a valid email address.":"Enter a valid report email address."},400);
  if(role==="member"&&requestedEmail&&requestedEmail!==ownEmail)return json({error:"Members can send personal attendance histories only to their account email."},403);
  let event:any,roster:any[],scope:"complete"|"personal";
  if(eventId){
   const {data:oneEvent,error:eventError}=await db.from("crew_events").select("id,title,description,location,starts_at").eq("id",eventId).maybeSingle();
   if(eventError||!oneEvent)return json({error:"Event not found."},404);
   const {data:registrations,error:regError}=await db.from("crew_registrations").select("member_id,registered_at,crew_profiles!inner(auth_id,name,email)").eq("event_id",eventId);if(regError)throw regError;
   const {data:attendanceRows,error:attError}=await db.from("crew_attendance").select("event_id,member_id,status,marked_at").eq("event_id",eventId);if(attError)throw attError;
   const {data:finalized,error:finalError}=await db.from("crew_event_finalizations").select("event_id").eq("event_id",eventId).maybeSingle();if(finalError)throw finalError;
   const attendanceByMember=new Map((attendanceRows||[]).map((r:any)=>[String(r.member_id),r]));
   roster=(registrations||[]).map((r:any)=>{const p=r.crew_profiles||{},a:any=attendanceByMember.get(String(r.member_id));return {member_id:String(r.member_id),name:String(p.name||"Crew member"),status:String(a?.status||(finalized?"absent":"pending")),marked_at:a?.marked_at||null};});
   const own=roster.find((r:any)=>r.member_id===user.id);
   if(role==="member"&&!own)return json({error:"You must be registered for this event to request your attendance statement."},403);
   scope=role==="member"?"personal":"complete";if(scope==="personal")roster=[own];event=oneEvent;
  }else{
   const [{data:events,error:eventError},{data:registrations,error:regError},{data:attendanceRows,error:attError},{data:finalizedRows,error:finalError}]=await Promise.all([
    db.from("crew_events").select("id,title,description,location,starts_at").order("starts_at",{ascending:true}),
    db.from("crew_registrations").select("event_id,member_id,registered_at,crew_profiles!inner(auth_id,name,email)"),
    db.from("crew_attendance").select("event_id,member_id,status,marked_at"),
    db.from("crew_event_finalizations").select("event_id")
   ]);
   if(eventError)throw eventError;if(regError)throw regError;if(attError)throw attError;if(finalError)throw finalError;
   const eventMap=new Map((events||[]).map((e:any)=>[String(e.id),e]));
   const attendanceMap=new Map((attendanceRows||[]).map((a:any)=>[String(a.event_id)+"|"+String(a.member_id),a]));
   const finalizedSet=new Set((finalizedRows||[]).map((x:any)=>String(x.event_id)));
   let allRows=(registrations||[]).map((r:any)=>{const p=r.crew_profiles||{},ev=eventMap.get(String(r.event_id)),a=attendanceMap.get(String(r.event_id)+"|"+String(r.member_id));if(!ev)return null;return {member_id:String(r.member_id),name:String(ev.title||"Kinetic Crew event")+" — "+String(p.name||"Crew member"),status:String(a?.status||(finalizedSet.has(String(r.event_id))?"absent":"pending")),marked_at:a?.marked_at||null,event_date:ev.starts_at||r.registered_at||null};}).filter(Boolean);
   scope=role==="member"?"personal":"complete";
   if(scope==="personal")allRows=allRows.filter((r:any)=>r.member_id===user.id);
   if(!allRows.length)return json({error:"No recorded attendance history was found yet."},404);
   const dates=allRows.map((r:any)=>r.event_date).filter(Boolean).sort();
   event={id:"all-events",title:"Complete Kinetic Crew attendance history",description:"All recorded events",location:"All crew venues",starts_at:dates[0]||new Date().toISOString()};
   roster=allRows;
  }
  const rows=roster;
  const stats={total:rows.length,present:rows.filter((r:any)=>r.status==="present").length,absent:rows.filter((r:any)=>r.status==="absent").length,pending:rows.filter((r:any)=>r.status==="pending").length,notAttending:rows.filter((r:any)=>r.status==="not_attending").length};
  const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com",smtpPass=Deno.env.get("SMTP_PASS");
  if(!smtpPass)return json({error:"Gmail SMTP is not configured. Add SMTP_PASS to Supabase Edge Function secrets."},503);
  const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
  try{await mailer.verify();}catch(error){const detail=String(error instanceof Error?error.message:"SMTP authentication failed");console.error("attendance report SMTP verification failed:",detail);return json({error:/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(detail)?"Gmail rejected SMTP authentication. Update SMTP_USER and the Google App Password in Supabase function secrets.":"Could not connect to Gmail SMTP. Check SMTP_USER and SMTP_PASS."},503);}
  const pdfBytes=await buildPdf(event,rows,stats,scope,String(profile.name||"Kinetic Crew"));
  const subject=(scope==="complete"?"Full attendance history":"Personal attendance history")+" · Kinetic Crew";
  const summary=[["Registered members",stats.total],["Present",stats.present],["Absent",stats.absent],["Pending",stats.pending],["Not attending",stats.notAttending]];
  const summaryHtml=summary.map(([label,value])=>"<tr><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8;color:#555'>"+label+"</td><td align='right' style='padding:8px 10px;border-bottom:1px solid #e8e8e8;font-weight:bold'>"+value+"</td></tr>").join("");
  const rowsHtml=rows.map((r:any)=>"<tr><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(r.name)+"</td><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(statusLabel(r.status))+"</td><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(stampLabel(r.marked_at))+"</td></tr>").join("");
  const heading=scope==="complete"?"Complete attendance report":"Personal attendance statement";
  const html=brandedEmail({
   eyebrow:"OFFICIAL ATTENDANCE REPORT",
   title:heading,
   subtitle:event.title+" · "+dateLabel(event.starts_at)+" · "+timeLabel(event.starts_at),
   contentHtml:'<p style="margin:0 0 16px;color:#e5e1e8;font-size:14px;line-height:1.65;">Dear '+esc(profile.name||"Kinetic Crew recipient")+',</p><p style="margin:0 0 20px;color:#c2bec8;font-size:13px;line-height:1.7;">Please find attached the '+heading+' for <b>'+esc(event.title)+'</b>. This email includes the attendance summary and a PDF copy for your records.</p><h2 style="font-size:15px;color:#ffad7c;margin:20px 0 8px;">Attendance summary</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;color:#eee;font-size:13px;">'+summary.map(([label,value])=>"<tr><td style='padding:9px 10px;border-bottom:1px solid #ffffff20;color:#c2bec8'>"+label+"</td><td align='right' style='padding:9px 10px;border-bottom:1px solid #ffffff20;font-weight:bold;color:#fff'>"+value+"</td></tr>").join("")+'</table><h2 style="font-size:15px;color:#ffad7c;margin:22px 0 8px;">'+(scope==="complete"?"Registered member details":"Your attendance status")+'</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:12px;color:#eee;"><tr style="background:#ffffff12;font-weight:bold;"><td style="padding:8px 10px;">Name</td><td style="padding:8px 10px;">Status</td><td style="padding:8px 10px;">Check-in</td></tr>'+rows.map((r:any)=>"<tr><td style='padding:8px 10px;border-bottom:1px solid #ffffff20'>"+esc(r.name)+"</td><td style='padding:8px 10px;border-bottom:1px solid #ffffff20'>"+esc(statusLabel(r.status))+"</td><td style='padding:8px 10px;border-bottom:1px solid #ffffff20'>"+esc(stampLabel(r.marked_at))+"</td></tr>").join("")+'</table><p style="font-size:13px;line-height:1.6;color:#c2bec8;margin-top:24px;">This is an automatically generated Kinetic Crew record. Contact the event administrator if any attendance detail needs correction.</p><p style="font-size:13px;font-weight:bold;color:#f4f0f5;margin-top:18px;">Regards,<br>Kinetic Crew Administration</p>',
   footerNote:"The attendance report PDF is attached to this email."
  })
  await mailer.sendMail({from:'"KINETIC CREW" <'+smtpUser+'>',to:recipientEmail,subject,html,attachments:[{filename:"kinetic-crew-attendance-report.pdf",content:Buffer.from(pdfBytes),contentType:"application/pdf"}]});
  return json({ok:true,sent:1,scope,reportRows:rows.length,summary});
 }catch(error){console.error("send-attendance-report:",error);return json({error:error instanceof Error?error.message:"Attendance report email failed."},500);}
});
