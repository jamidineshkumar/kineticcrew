import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const esc = (v: unknown) => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || "";
    } catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}
function passwordFromDob(value: unknown) {
  const raw = String(value ?? "").trim();
  let day="", month="", year="";
  let match=raw.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (match) { year=match[1]; month=match[2]; day=match[3]; }
  else if ((match=raw.match(/^([0-9]{2})([0-9]{2})([0-9]{4})$/))) { day=match[1]; month=match[2]; year=match[3]; }
  else if ((match=raw.match(/^([0-9]{2})[/-]([0-9]{2})[/-]([0-9]{4})$/))) { day=match[1]; month=match[2]; year=match[3]; }
  else throw new Error("Applicant date of birth is missing or invalid. Update the application before sending credentials.");
  const d=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
  if (d.getUTCFullYear()!==Number(year) || d.getUTCMonth()!==Number(month)-1 || d.getUTCDate()!==Number(day)) {
    throw new Error("Applicant date of birth is invalid. Update the application before sending credentials.");
  }
  return day+month+year;
}
const nameUsername = (value:string,suffix:number) => {
  const base=value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,18).replace(/_+$/g,"") || "applicant";
  const tail=suffix>1?"_"+suffix:"";
  return (base.slice(0,24-tail.length)+tail).slice(0,24);
};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required."},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=readKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const service=readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if(!url||!anon||!service) return json({error:"Supabase authentication is not configured for audition invitations."},503);

  const authorization=req.headers.get("Authorization")||"";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser();
  if(authError||!authData.user) return json({error:"Sign in required."},401);

  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:actor,error:actorError}=await db.from("crew_profiles").select("auth_id,role,approval_status").eq("auth_id",authData.user.id).maybeSingle();
  if(actorError||!actor||actor.approval_status!=="approved"||!["admin","super_admin"].includes(actor.role)) {
    return json({error:"Only approved Admins and Super Admins can send audition invitations."},403);
  }

  let claimKey="",claimEmail="",claimOwned=false;
  try {
    const body=await req.json();
    const id=String(body.applicationId||"").trim();
    const forceResend=body.resend===true;
    if(!/^[0-9a-f-]{36}$/i.test(id)) return json({error:"A valid application ID is required."},400);

    const {data:app,error:appError}=await db.from("crew_audition_applications")
      .select("id,name,email,application_status,auth_id,username,application_data")
      .eq("id",id).maybeSingle();
    if(appError) throw appError;
    if(!app) return json({error:"Application not found."},404);
    if(!["audition_invited","credentials_sent"].includes(app.application_status)) {
      return json({error:"The initial application must be accepted before audition access can be issued."},409);
    }

    const email=String(app.email||"").trim().toLowerCase();
    const key="audition-invitation:"+app.id;
    claimKey=key; claimEmail=email;

    const {data:existing,error:existingError}=await db.from("crew_email_delivery_log")
      .select("status,created_at").eq("idempotency_key",key).eq("recipient_email",email).maybeSingle();
    if(existingError) throw existingError;
    if(existing?.status==="sent"&&!forceResend) return json({ok:true,alreadySent:true,resendRequired:true});
    if(existing?.status==="sending") {
      const createdAt=Date.parse(existing.created_at||"");
      if(Number.isFinite(createdAt)&&Date.now()-createdAt<15*60*1000) return json({ok:true,inProgress:true},202);
    }
    if(existing) {
      const {error:clearError}=await db.from("crew_email_delivery_log").delete().eq("idempotency_key",key).eq("recipient_email",email);
      if(clearError) throw clearError;
    }
    const {data:claim,error:claimError}=await db.from("crew_email_delivery_log")
      .insert({idempotency_key:key,recipient_email:email,status:"sending"})
      .select("recipient_email").maybeSingle();
    if(claimError?.code==="23505") return json({ok:true,inProgress:true},202);
    if(claimError) throw claimError;
    if(!claim) return json({ok:true,inProgress:true},202);
    claimOwned=true;

    const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com";
    const smtpPass=Deno.env.get("SMTP_PASS");
    if(!smtpPass) throw new Error("SMTP_PASS is not configured in Supabase Edge Function secrets.");
    const password=passwordFromDob(app.application_data?.dob);

    let username=String(app.username||"").trim().toLowerCase();
    if(app.auth_id) {
      const {data:profile,error:profileError}=await db.from("crew_profiles")
        .select("auth_id,email,username,role,approval_status")
        .eq("auth_id",app.auth_id).maybeSingle();
      if(profileError) throw profileError;
      if(!profile||profile.approval_status!=="approved"||profile.role!=="audition_participant") {
        return json({error:"The linked account is not an active Audition Portal account. Contact the Super Admin."},409);
      }
      username=String(profile.username||username).trim().toLowerCase();
      if(!username) throw new Error("The audition username is missing. Retry account provisioning.");
    } else {
      if(app.application_status!=="audition_invited") {
        return json({error:"This application is not ready for first-time audition account provisioning."},409);
      }
      const {data:existingProfile,error:existingProfileError}=await db.from("crew_profiles")
        .select("auth_id,role").eq("email",email).maybeSingle();
      if(existingProfileError) throw existingProfileError;
      if(existingProfile) {
        return json({error:"This email already belongs to a Kinetic Crew account. Ask an Admin to review the application; an existing member account will not be overwritten."},409);
      }

      let prepared=false,lastCredentialError="";
      for(let attempt=1;attempt<=30&&!prepared;attempt++) {
        username=nameUsername(String(app.name||""),attempt);
        const {error}=await userClient.rpc("crew_audition_prepare_invitation_credentials",{
          p_application_id:id,p_username:username,p_temporary_password:password
        });
        if(!error) prepared=true;
        else if(/already in use|unique|duplicate/i.test(error.message||"")) lastCredentialError=error.message;
        else throw error;
      }
      if(!prepared) throw new Error("Could not create a unique name-based username. "+lastCredentialError);

      const {data:created,error:createError}=await db.auth.admin.createUser({
        email,
        password,
        email_confirm:true,
        user_metadata:{full_name:String(app.name||"Audition applicant"),username}
      });
      if(createError||!created?.user) {
        throw new Error(createError?.message?.toLowerCase().includes("already")?
          "This email already has a Kinetic Crew sign-in account. Contact an Admin to link it safely.":
          (createError?.message||"Could not create the audition sign-in account."));
      }
      const newAuthId=created.user.id;
      const {data:attached,error:attachError}=await userClient.rpc("crew_audition_attach_account",{
        p_application_id:id,p_auth_id:newAuthId,p_username:username
      });
      if(attachError||!attached?.ok) {
        await db.from("crew_profiles").delete().eq("auth_id",newAuthId);
        await db.auth.admin.deleteUser(newAuthId).catch(()=>({error:null}));
        throw attachError||new Error("Could not activate the separate Audition Portal account.");
      }
    }

    const loginUrl=new URL("login.html","https://kineticcrew.vercel.app");
    const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
    await mailer.verify();
    await mailer.sendMail({
      from:{name:"Kinetic Crew",address:smtpUser},
      to:email,
      subject:"Your Kinetic Crew audition invitation",
      text:"Hello "+String(app.name||"Applicant")+",\n\nYour Kinetic Crew application has been accepted. You are invited to the online audition stage.\n\nYOUR AUDITION LOGIN\nUsername: "+username+"\nTemporary password (your date of birth in DDMMYYYY format): "+password+"\n\nOpen the Kinetic Crew app and choose Sign In. Enter the username and temporary password above. Do not choose Sign Up or create another account. After successful sign-in, you will be taken automatically to the separate Audition Portal, not the regular Crew Member page.\n\nOpen Kinetic Crew: "+loginUrl.href+"\n\nFrom the Audition tab, submit your audition video. This is an online audition; no physical venue visit is required. Any further instructions or meeting link will be shared through Kinetic Crew.\n\nKinetic Crew",
      html:'<!doctype html><html><body style="margin:0;padding:28px;background:#09080d;color:#f7f4f8;font-family:Arial,sans-serif"><div style="max-width:540px;margin:auto"><p style="letter-spacing:4px;color:#f0a2cf;font-size:11px;font-weight:bold">KINETIC CREW · AUDITION INVITATION</p><h1 style="font-size:30px;margin:12px 0">Your application is accepted</h1><div style="padding:24px;border:1px solid #55404e;border-radius:22px;background:#211720"><p>Hello '+esc(app.name)+',</p><p>Your application has been accepted. You are invited to the online audition stage.</p><p><b>Username</b><br>'+esc(username)+'</p><p><b>Temporary password (DOB in DDMMYYYY format)</b><br>'+esc(password)+'</p><p><a href="'+esc(loginUrl.href)+'" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d94691;color:white;text-decoration:none;font-weight:bold">Open Kinetic Crew</a></p><p style="font-size:12px;color:#c4b7c4">Open the app and choose Sign In. Enter the username and temporary password above. Do not choose Sign Up or create another account. After successful sign-in, you will be taken automatically to the separate Audition Portal, not the regular Crew Member page. From the Audition tab, submit your audition video. This is an online audition; no physical venue visit is required. Any further instructions or meeting link will be shared through Kinetic Crew.</p></div><p style="font-size:12px;color:#9f96a2;margin-top:18px">Kinetic Crew</p></div></body></html>'
    });

    const {error:markError}=await db.from("crew_email_delivery_log")
      .update({status:"sent",sent_at:new Date().toISOString()})
      .eq("idempotency_key",key).eq("recipient_email",email);
    if(markError) throw markError;
    claimOwned=false;
    return json({ok:true,sent:1,email,accountReady:true,username});
  } catch(error) {
    console.error("send-audition-invitation:",error);
    if(claimOwned&&claimKey&&claimEmail) {
      const {error:releaseError}=await db.from("crew_email_delivery_log").delete()
        .eq("idempotency_key",claimKey).eq("recipient_email",claimEmail).eq("status","sending");
      if(releaseError) console.error("Could not release failed audition invitation claim:",releaseError);
    }
    return json({error:error instanceof Error?error.message:"Audition invitation failed."},500);
  }
});