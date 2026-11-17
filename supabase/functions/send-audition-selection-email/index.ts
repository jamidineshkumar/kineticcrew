import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (typeof parsed === "string") return parsed; if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || ""; }
    catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=readKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"",service=readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"",authorization=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 if(authError||!authData.user)return json({error:"Sign in required."},401);
 const db=createClient(url,service);
 const {data:actor,error:actorError}=await db.from("crew_profiles").select("auth_id,role,approval_status").eq("auth_id",authData.user.id).maybeSingle();
 if(actorError||!actor||actor.approval_status!=="approved"||!["admin","super_admin"].includes(actor.role))return json({error:"Only approved Admins and Super Admins can issue final Member access."},403);
 try{
  const body=await req.json(),id=String(body.applicationId||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"A valid application ID is required."},400);
  const {data:app,error:appError}=await db.from("crew_audition_applications").select("id,name,email,application_status,auth_id,username").eq("id",id).maybeSingle();
  if(appError)throw appError;
  if(!app)return json({error:"Audition application not found."},404);
  if(app.application_status!=="selected")return json({error:"Both reviewers must accept the audition video before Member access can be issued."},409);
  if(!app.auth_id)return json({error:"The applicant must activate their separate Audition Portal account before final selection."},409);
  const email=String(app.email||"").trim().toLowerCase(),key="audition-selected-member-login:"+app.id;
  const {data:existing,error:existingError}=await db.from("crew_email_delivery_log").select("status").eq("idempotency_key",key).eq("recipient_email",email).maybeSingle();
  if(existingError)throw existingError;
  if(existing?.status==="sent")return json({ok:true,alreadySent:true,message:"Final selection email was already sent."});
  const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com",smtpPass=Deno.env.get("SMTP_PASS");
  if(!smtpPass)return json({error:"SMTP_PASS is not configured in Supabase Edge Function secrets."},503);
  const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
  await mailer.verify();
  await mailer.sendMail({
   from:{name:"Kinetic Crew",address:smtpUser},to:email,subject:"You're selected — welcome to Kinetic Crew",
   text:"Hello "+String(app.name||"Applicant")+",\n\nCongratulations! Both the Kinetic Crew Admin and President selected your audition.\n\nYour audition account has now been upgraded automatically to regular Kinetic Crew Member access.\n\nUsername: "+String(app.username||"")+
    "\n\nSign in at https://kineticcrew.vercel.app/login.html?audition=credentials-sent with your Kinetic Crew username and the current password for your Audition Portal account. After sign-in, the app will open the mandatory Change Password screen. Enter a new private password, confirm it, and save. Use your new password for future sign-ins.\n\nKinetic Crew",
   html:'<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif"><div style="max-width:520px;margin:auto"><p style="letter-spacing:4px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · FINAL SELECTION</p><h1 style="font-size:30px;margin:12px 0">You’re selected!</h1><div style="padding:24px;border:1px solid #55404e;border-radius:22px;background:#211720"><p>Hello '+esc(app.name)+',</p><p>Both reviewers selected your audition. Welcome to Kinetic Crew.</p><p>Your Audition Portal account has been upgraded automatically to regular Member access.</p><p><b>Username</b><br>'+esc(app.username)+'</p><p>Sign in with your Kinetic Crew username and the current password for your Audition Portal account. The app will require you to set and confirm a new private password before entering the regular Crew Member app. Use that new password for future sign-ins.</p><p><a href="https://kineticcrew.vercel.app/login.html" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:white;text-decoration:none;font-weight:bold">Sign in to Kinetic Crew</a></p></div><p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew</p></div></body></html>'
  });
  const {error:profileError}=await db.from("crew_profiles").update({role:"member",approval_status:"approved",must_change_password:true,password_change_required_since:new Date().toISOString(),approved_at:new Date().toISOString()}).eq("auth_id",app.auth_id);
  if(profileError)throw profileError;
  const {error:markError}=await db.from("crew_email_delivery_log").upsert({idempotency_key:key,recipient_email:email,status:"sent",sent_at:new Date().toISOString()},{onConflict:"idempotency_key,recipient_email"});
  if(markError)throw markError;
  return json({ok:true,sent:1,email,memberActivated:true});
 }catch(error){console.error("send-audition-selection-email:",error);return json({error:error instanceof Error?error.message:"Final selection email failed."},500);}
});