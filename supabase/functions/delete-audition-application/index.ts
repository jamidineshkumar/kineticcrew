import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc=(v:unknown)=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!));

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
 const url=Deno.env.get("SUPABASE_URL")||"",anon=readKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"",service=readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";
 const authHeader=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 if(authError||!authData.user)return json({error:"Sign in again before deleting an application."},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json();
  const id=String(body.applicationId||"").trim();
  const incorrectDetails=body.incorrectDetails===true;
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"A valid application ID is required."},400);
  if(incorrectDetails){
   const {data:actor,error:actorError}=await admin.from("crew_profiles").select("role,approval_status").eq("auth_id",authData.user.id).maybeSingle();
   if(actorError)throw actorError;
   if(!actor||actor.approval_status!=="approved"||!["admin","super_admin"].includes(actor.role))return json({error:"Only approved Kinetic Crew Admins and the President can reject incorrect application details."},403);
   const {data:app,error:appError}=await admin.from("crew_audition_applications").select("id,name,email").eq("id",id).maybeSingle();
   if(appError)throw appError;
   if(!app)return json({error:"Application not found. It may already have been removed."},404);
   const email=String(app.email||"").trim().toLowerCase();
   if(!email)return json({error:"Applicant email is missing. No data was deleted."},409);
   const key="audition-incorrect-details-rejection:"+id;
   const {data:delivery,error:deliveryError}=await admin.from("crew_email_delivery_log").select("status").eq("idempotency_key",key).eq("recipient_email",email).maybeSingle();
   if(deliveryError)throw deliveryError;
   if(delivery?.status!=="sent"){
    const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com",smtpPass=Deno.env.get("SMTP_PASS");
    if(!smtpPass)return json({error:"SMTP_PASS is not configured. Applicant was not emailed and no data was deleted."},503);
    const applyUrl="https://kineticcrew.vercel.app/audition-application.html";
    const name=String(app.name||"Applicant");
    const subject="Kinetic Crew audition application — details need correction";
    const textBody="Hello "+name+",\n\nThank you for your interest in Kinetic Crew. During review, we found that some details in your audition application appear to be incorrect or could not be verified. Your current application has therefore been rejected and its application data will be removed from our audition system.\n\nIf you are still interested, please check your details carefully and submit a fresh application here: "+applyUrl+"\n\nPlease use your correct registration number, contact number and email details.\n\nKinetic Crew Admin & President";
    const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
    await mailer.verify();
    await mailer.sendMail({from:{name:"Kinetic Crew",address:smtpUser},to:email,subject,text:textBody,html:'<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif"><div style="max-width:540px;margin:auto"><p style="letter-spacing:3px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · AUDITION APPLICATION</p><h2 style="font-size:26px">A quick update about your application</h2><div style="padding:22px;border:1px solid #55404e;border-radius:18px;background:#211720"><p>Hello '+esc(name)+',</p><p>Thank you for your interest in Kinetic Crew. During review, we found that some details in your audition application appear to be incorrect or could not be verified.</p><p>Your current application has therefore been rejected, and its application data will be removed from our audition system.</p><p>If you are still interested, please check your information carefully and submit a fresh application using the button below.</p><p><a href="'+applyUrl+'" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:#fff;text-decoration:none;font-weight:bold">Reapply to Kinetic Crew</a></p><p style="font-size:12px;color:#c8b9c5">Please enter your correct registration number, contact number and email details.</p></div><p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew Admin &amp; President</p></div></body></html>'});
    const {error:logError}=await admin.from("crew_email_delivery_log").upsert({idempotency_key:key,recipient_email:email,status:"sent",sent_at:new Date().toISOString()},{onConflict:"idempotency_key,recipient_email"});
    if(logError)throw new Error("Rejection email was sent, but its delivery record could not be saved. Retry safely: "+logError.message);
   }
  }
  const {data:result,error}=await userClient.rpc("crew_audition_admin_delete_application",{p_application_id:id});
  if(error)throw error;
  if(!result?.ok)throw new Error("Application deletion did not complete.");
  const videoPath=String(result.video_storage_path||"").trim();
  if(videoPath){
   const {error:storageError}=await admin.storage.from("audition-videos").remove([videoPath]);
   if(storageError)throw new Error("Application record deleted, but audition video storage cleanup failed: "+storageError.message);
  }
  if(result.account_deleted&&result.auth_id){
   const {error:authDeleteError}=await admin.auth.admin.deleteUser(String(result.auth_id));
   if(authDeleteError)throw new Error("Application data was deleted, but the audition login account still needs removal: "+authDeleteError.message);
  }
  return json({ok:true,message:(incorrectDetails?"Applicant emailed with the incorrect-details rejection and reapplication link. ":"")+"Application, review history"+(videoPath?", audition video":"")+(result.account_deleted?", and audition login account":"")+" permanently deleted."});
 }catch(error){
  console.error("delete-audition-application:",error);
  return json({error:error instanceof Error?error.message:"Could not delete this application."},500);
 }
});