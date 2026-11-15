import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc = (v: unknown) => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const randomText = (n:number) => { const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; const b=crypto.getRandomValues(new Uint8Array(n)); return Array.from(b,x=>chars[x%chars.length]).join(""); };
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"POST required."},405);
 const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const authorization=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 if(authError||!authData.user) return json({error:"Sign in required."},401);
 const db=createClient(url,service);
 const {data:actor,error:actorError}=await db.from("crew_profiles").select("auth_id,role,approval_status").eq("auth_id",authData.user.id).maybeSingle();
 if(actorError||!actor||actor.approval_status!=="approved"||!["admin","super_admin"].includes(actor.role)) return json({error:"Only approved Admins and Super Admins can send audition invitations."},403);
 try{
  const body=await req.json(), id=String(body.applicationId||"").trim(), forceResend=body.resend===true;
  if(!/^[0-9a-f-]{36}$/i.test(id)) return json({error:"A valid application ID is required."},400);
  const {data:app,error:appError}=await db.from("crew_audition_applications").select("id,name,email,application_status,auth_id").eq("id",id).maybeSingle();
  if(appError) throw appError;
  if(!app) return json({error:"Application not found."},404);
  if(app.application_status!=="audition_invited") return json({error:"Both reviewers must accept the initial application first."},409);
  if(app.auth_id) return json({ok:true,alreadyActivated:true});
  const email=String(app.email||"").trim().toLowerCase();
  const key="audition-invitation:"+app.id;
  const {data:existing,error:existingError}=await db.from("crew_email_delivery_log").select("status").eq("idempotency_key",key).eq("recipient_email",email).maybeSingle();
  if(existingError) throw existingError;
  if(existing?.status==="sent"&&!forceResend) return json({ok:true,alreadySent:true,resendRequired:true});
  if(existing?.status==="sent"&&forceResend){const {error:deleteSentError}=await db.from("crew_email_delivery_log").delete().eq("idempotency_key",key).eq("recipient_email",email).eq("status","sent");if(deleteSentError) throw deleteSentError;}
  const stale=new Date(Date.now()-15*60*1000).toISOString();
  await db.from("crew_email_delivery_log").delete().eq("idempotency_key",key).eq("recipient_email",email).eq("status","sending").lt("created_at",stale);
  const {data:claim,error:claimError}=await db.from("crew_email_delivery_log").insert({idempotency_key:key,recipient_email:email,status:"sending"}).select("recipient_email").maybeSingle();
  if(claimError?.code==="23505") return json({ok:true,inProgress:true});
  if(claimError) throw claimError;
  if(!claim) return json({ok:true,inProgress:true});
  const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com", smtpPass=Deno.env.get("SMTP_PASS");
  if(!smtpPass){await db.from("crew_email_delivery_log").delete().eq("idempotency_key",key).eq("recipient_email",email);return json({error:"SMTP_PASS is not configured in Supabase Edge Function secrets."},503);}
  let username="",password="",prepared=false;
  for(let attempt=0;attempt<8&&!prepared;attempt++){
   username="aud"+randomText(5).toLowerCase(); password=randomText(8);
   const {error}=await userClient.rpc("crew_audition_prepare_invitation_credentials",{p_application_id:id,p_username:username,p_temporary_password:password});
   if(!error) prepared=true; else if(!/already in use|unique|duplicate/i.test(error.message||"")) throw error;
  }
  if(!prepared) throw new Error("Could not generate a unique audition username. Retry the invitation.");
  const loginUrl=new URL("login.html","https://kineticcrew.vercel.app");
  loginUrl.searchParams.set("audition","invitation");loginUrl.searchParams.set("username",username);loginUrl.searchParams.set("email",email);
  const portalUrl=new URL("audition.html","https://kineticcrew.vercel.app");
  const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
  try{
   await mailer.verify();
   await mailer.sendMail({
    from:{name:"Kinetic Crew",address:smtpUser},to:email,subject:"Your Kinetic Crew audition invitation",
    text:"Hello "+String(app.name||"Applicant")+",\n\nYour Kinetic Crew application has been accepted. You are invited to the online audition stage.\n\nAUDITION PORTAL LOGIN\nUsername: "+username+"\nTemporary password: "+password+"\n\nOpen "+loginUrl.href+", choose Sign Up, enter the exact username, this personal email and temporary password, then verify your email. Your account opens only the separate Audition Portal, not regular Crew Member access.\n\nAudition Portal: "+portalUrl.href+"\n\nAfter signing in, open the Audition tab and submit your audition video for the online audition. No physical venue visit is required. Any online audition instructions or meeting link will be shared through Kinetic Crew.\n\nKinetic Crew",
    html:'<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif"><div style="max-width:540px;margin:auto"><p style="letter-spacing:4px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · AUDITION INVITATION</p><h1 style="font-size:30px;margin:12px 0">Your application is accepted</h1><div style="padding:24px;border:1px solid #55404e;border-radius:22px;background:#211720"><p>Hello '+esc(app.name)+',</p><p>Your application has been accepted. You are invited to the online audition stage.</p><p><b>Username</b><br>'+esc(username)+'</p><p><b>Temporary password</b><br>'+esc(password)+'</p><p><a href="'+esc(loginUrl.href)+'" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:white;text-decoration:none;font-weight:bold">Open Audition Login</a></p><p style="font-size:12px;color:#c4b7c4">Use Sign Up with these exact credentials and verify your email. This account provides access only to the separate Audition Portal, not the regular Crew Member area. Submit your audition video from the Audition tab for the online audition. No physical venue visit is required. Any online audition instructions or meeting link will be shared through Kinetic Crew.</p></div><p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew</p></div></body></html>'
   });
   const {error:markError}=await db.from("crew_email_delivery_log").update({status:"sent",sent_at:new Date().toISOString()}).eq("idempotency_key",key).eq("recipient_email",email);
   if(markError) throw markError;
   return json({ok:true,sent:1,email});
  }catch(mailError){
   await db.from("crew_email_delivery_log").delete().eq("idempotency_key",key).eq("recipient_email",email);
   console.error("Audition invitation email failed:",String(mailError));
   return json({error:"The audition invitation credentials were prepared, but the email could not be delivered. Retry from Audition Management."},503);
  }
 }catch(error){console.error("send-audition-invitation:",error);return json({error:error instanceof Error?error.message:"Audition invitation failed."},500);}
});