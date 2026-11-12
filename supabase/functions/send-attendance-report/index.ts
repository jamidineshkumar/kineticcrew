import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
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
 const pdf=await PDFDocument.create(); pdf.setTitle((scope==="complete"?"Attendance Report - ":"Personal Attendance - ")+event.title); pdf.setAuthor("KINETIC CREW");
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,H=841.89,margin=42; let page=pdf.addPage([W,H]),y=798;
 const ink=hex("#24282b"),muted=hex("#747b7e"),coral=hex("#f06b4e"),pale=hex("#f7eee9"),white=hex("#ffffff");
 const draw=(v:unknown,x:number,yy:number,size=10,font=regular,color=ink)=>page.drawText(safePdf(v),{x,y:yy,size,font,color});
 const fit=(v:unknown,font:any,size:number,width:number)=>{let t=safePdf(v);while(t.length>2&&font.widthOfTextAtSize(t,size)>width)t=t.slice(0,-2)+"...";return t;};
 const tableHead=()=>{page.drawRectangle({x:margin,y:y-7,width:511,height:23,color:ink});draw("Member name",margin+7,y,8,bold,white);draw("Attendance status",margin+252,y,8,bold,white);draw("Check-in time",margin+372,y,8,bold,white);y-=22;};
 const nextPage=()=>{page=pdf.addPage([W,H]);y=798;draw("KINETIC CREW  /  ATTENDANCE REPORT",margin,y,8,bold,coral);y-=28;tableHead();};
 draw("KINETIC CREW  /  OFFICIAL REPORT",margin,y,9,bold,coral);y-=34;
 draw(scope==="complete"?"Attendance report":"Personal attendance statement",margin,y,25,bold);y-=28;
 draw(fit(event.title,bold,15,500),margin,y,15,bold);y-=20;
 draw("Date: "+dateLabel(event.starts_at)+"    Time: "+timeLabel(event.starts_at),margin,y,9,regular,muted);y-=15;
 draw("Venue: "+fit(event.location||"To be announced",regular,9,450),margin,y,9,regular,muted);y-=30;
 page.drawRectangle({x:margin,y:y-58,width:511,height:70,color:pale,borderColor:hex("#f1c6b5"),borderWidth:.7});
 const statsList=[["REGISTERED",stats.total],["PRESENT",stats.present],["ABSENT",stats.absent],["PENDING",stats.pending],["NOT ATTENDING",stats.notAttending]],bw=511/5;
 statsList.forEach((it,i)=>{const x=margin+i*bw+8;draw(String(it[1]),x,y-17,18,bold,coral);draw(it[0],x,y-38,6,bold,muted);});
 y-=88;draw(scope==="complete"?"REGISTERED MEMBER ATTENDANCE":"YOUR EVENT STATUS",margin,y,9,bold,coral);y-=18;tableHead();
 for(let i=0;i<rows.length;i++){
  if(y<72)nextPage();
  const row=rows[i];if(i%2===0)page.drawRectangle({x:margin,y:y-7,width:511,height:22,color:hex("#f4f5f5")});
  draw(fit(row.name||"Crew member",regular,8.5,220),margin+7,y,8.5);
  draw(statusLabel(row.status),margin+252,y,8.2,bold,row.status==="present"?hex("#277c62"):ink);
  draw(stampLabel(row.marked_at),margin+372,y,7.5,regular,muted);y-=22;
 }
 if(y<65)nextPage();else y-=18;
 draw("Prepared by: "+preparedBy,margin,y,8,regular,muted);
 draw("KINETIC CREW  |  Generated "+stampLabel(new Date().toISOString()),margin,48,7,regular,muted);
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
  if(!eventId)return json({error:"Choose an event first."},400);
  const {data:event,error:eventError}=await db.from("crew_events").select("id,title,description,location,starts_at").eq("id",eventId).maybeSingle();
  if(eventError||!event)return json({error:"Event not found."},404);
  const ownEmail=String(profile.email||user.email||"").trim().toLowerCase(),requestedEmail=String(body.toEmail||"").trim().toLowerCase();
  const recipientEmail=role==="member"?ownEmail:requestedEmail;
  if(!recipientEmail||! /^\S+@\S+\.\S+$/.test(recipientEmail))return json({error:"Enter a valid report email address."},400);
  if(role==="member"&&requestedEmail&&requestedEmail!==ownEmail)return json({error:"Members can send personal attendance statements only to their account email."},403);
  const {data:registrations,error:regError}=await db.from("crew_registrations").select("member_id,registered_at,crew_profiles!inner(auth_id,name,email)").eq("event_id",eventId);
  if(regError)throw regError;
  const {data:attendanceRows,error:attError}=await db.from("crew_attendance").select("event_id,member_id,status,marked_at").eq("event_id",eventId);
  if(attError)throw attError;
  const {data:finalized,error:finalError}=await db.from("crew_event_finalizations").select("event_id").eq("event_id",eventId).maybeSingle();
  if(finalError)throw finalError;
  const attendanceByMember=new Map((attendanceRows||[]).map((r:any)=>[String(r.member_id),r]));
  const roster=(registrations||[]).map((r:any)=>{
   const p=r.crew_profiles||{},a:any=attendanceByMember.get(String(r.member_id));
   return {member_id:String(r.member_id),name:String(p.name||"Crew member"),status:String(a?.status||(finalized?"absent":"pending")),marked_at:a?.marked_at||null};
  });
  const own=roster.find((r:any)=>r.member_id===user.id);
  if(role==="member"&&!own)return json({error:"You must be registered for this event to request your attendance statement."},403);
  const scope=role==="member"?"personal":"complete",rows=scope==="personal"?[own]:roster;
  const stats={total:roster.length,present:roster.filter((r:any)=>r.status==="present").length,absent:roster.filter((r:any)=>r.status==="absent").length,pending:roster.filter((r:any)=>r.status==="pending").length,notAttending:roster.filter((r:any)=>r.status==="not_attending").length};
  const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com",smtpPass=Deno.env.get("SMTP_PASS");
  if(!smtpPass)return json({error:"Gmail SMTP is not configured. Add SMTP_PASS to Supabase Edge Function secrets."},503);
  const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
  try{await mailer.verify();}catch(error){const detail=String(error instanceof Error?error.message:"SMTP authentication failed");console.error("attendance report SMTP verification failed:",detail);return json({error:/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(detail)?"Gmail rejected SMTP authentication. Update SMTP_USER and the Google App Password in Supabase function secrets.":"Could not connect to Gmail SMTP. Check SMTP_USER and SMTP_PASS."},503);}
  const pdfBytes=await buildPdf(event,rows,stats,scope,String(profile.name||"Kinetic Crew"));
  const subject=(scope==="complete"?"Attendance report · ":"Personal attendance · ")+String(event.title||"Kinetic Crew event")+" · Kinetic Crew";
  const summary=[["Registered members",stats.total],["Present",stats.present],["Absent",stats.absent],["Pending",stats.pending],["Not attending",stats.notAttending]];
  const summaryHtml=summary.map(([label,value])=>"<tr><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8;color:#555'>"+label+"</td><td align='right' style='padding:8px 10px;border-bottom:1px solid #e8e8e8;font-weight:bold'>"+value+"</td></tr>").join("");
  const rowsHtml=rows.map((r:any)=>"<tr><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(r.name)+"</td><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(statusLabel(r.status))+"</td><td style='padding:8px 10px;border-bottom:1px solid #e8e8e8'>"+esc(stampLabel(r.marked_at))+"</td></tr>").join("");
  const heading=scope==="complete"?"Complete attendance report":"Personal attendance statement";
  const html="<!doctype html><html><body style='margin:0;padding:24px 12px;background:#f3f4f4;font-family:Arial,Helvetica,sans-serif;color:#24282b'><table role='presentation' width='100%'><tr><td align='center'><table role='presentation' width='100%' style='max-width:640px;background:#fff;border:1px solid #e4e4e4;border-radius:16px'><tr><td style='padding:26px 28px;background:#24282b;color:#fff'><div style='font-size:11px;letter-spacing:3px;color:#ff9a7e;font-weight:bold'>KINETIC CREW / OFFICIAL REPORT</div><h1 style='margin:14px 0 6px;font-size:25px'>"+esc(event.title)+"</h1><div style='font-size:13px;color:#d6d9da'>"+esc(dateLabel(event.starts_at))+" · "+esc(timeLabel(event.starts_at))+" · "+esc(event.location||"Venue to be announced")+"</div></td></tr><tr><td style='padding:24px 28px'><p style='font-size:15px;line-height:1.6'>Dear "+esc(profile.name||"Kinetic Crew recipient")+",</p><p style='font-size:14px;line-height:1.65;color:#50575a'>Please find attached the "+heading+" for <b>"+esc(event.title)+"</b>. This email includes the attendance summary and a PDF copy for your records.</p><h2 style='font-size:15px;margin:22px 0 8px'>Attendance summary</h2><table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse'>"+summaryHtml+"</table><h2 style='font-size:15px;margin:22px 0 8px'>"+(scope==="complete"?"Registered member details":"Your attendance status")+"</h2><table role='presentation' width='100%' cellspacing='0' cellpadding='0' style='border-collapse:collapse;font-size:12px'><tr style='background:#f2f3f3;font-weight:bold'><td style='padding:8px 10px'>Name</td><td style='padding:8px 10px'>Status</td><td style='padding:8px 10px'>Check-in</td></tr>"+rowsHtml+"</table><p style='font-size:13px;line-height:1.6;color:#50575a;margin-top:24px'>This is an automatically generated Kinetic Crew record. Please contact the event administrator if any attendance detail needs correction.</p><p style='font-size:13px;font-weight:bold;margin-top:18px'>Regards,<br>Kinetic Crew Administration</p></td></tr><tr><td style='padding:14px 28px;background:#f5f5f5;color:#858b8d;font-size:10px;letter-spacing:1px'>KINETIC CREW · ONE CREW, ONE RHYTHM</td></tr></table></td></tr></table></body></html>";
  await mailer.sendMail({from:'"KINETIC CREW" <'+smtpUser+'>',to:recipientEmail,subject,html,attachments:[{filename:"kinetic-crew-attendance-report.pdf",content:Buffer.from(pdfBytes),contentType:"application/pdf"}]});
  return json({ok:true,sent:1,scope,reportRows:rows.length,summary});
 }catch(error){console.error("send-attendance-report:",error);return json({error:error instanceof Error?error.message:"Attendance report email failed."},500);}
});
