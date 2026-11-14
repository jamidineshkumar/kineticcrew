import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";
import { brandedEmail } from "./email-template.ts";

const cors = {"Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,"Content-Type":"application/json"}});
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  if (req.method !== "POST") return json({error:"POST required."},405);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:authError}=await userClient.auth.getUser();
  if(authError||!user) return json({error:"Sign in required."},401);
  const adminClient=createClient(supabaseUrl,service);
  const {data:actor}=await adminClient.from("crew_profiles").select("role,approval_status").eq("auth_id",user.id).maybeSingle();
  if(!actor||actor.approval_status!=="approved"||!["admin","super_admin"].includes(actor.role)) return json({error:"Admin access required."},403);
  let targetId="";
  try {
    const body=await req.json();
    targetId=String(body.authId||"");
    if(!targetId) return json({error:"Member ID is required."},400);
    const {data:member,error:memberError}=await adminClient.from("crew_profiles")
      .select("auth_id,email,name,username,approval_status,welcome_email_sent_at,welcome_email_claimed_at")
      .eq("auth_id",targetId).maybeSingle();
    if(memberError||!member) return json({error:"Member account not found."},404);
    if(member.approval_status!=="approved") return json({error:"Welcome email can only be sent after approval."},409);
    if(member.welcome_email_sent_at) return json({ok:true,alreadySent:true,message:"Welcome email was already sent."});
    if(member.welcome_email_claimed_at && Date.now()-new Date(member.welcome_email_claimed_at).getTime()<10*60*1000)
      return json({ok:true,alreadySending:true,message:"Welcome email is already being processed."});
    const claimAt=new Date().toISOString();
    const {data:claim,error:claimError}=await adminClient.from("crew_profiles").update({welcome_email_claimed_at:claimAt})
      .eq("auth_id",targetId).is("welcome_email_sent_at",null)
      .or("welcome_email_claimed_at.is.null,welcome_email_claimed_at.lt."+new Date(Date.now()-10*60*1000).toISOString())
      .select("auth_id").maybeSingle();
    if(claimError) throw claimError;
    if(!claim) return json({ok:true,alreadySending:true,message:"Welcome email is already being processed."});
    const smtpUser=Deno.env.get("SMTP_USER")||"kineticcreww@gmail.com";
    const smtpPass=Deno.env.get("SMTP_PASS");
    if(!smtpPass) throw new Error("SMTP_PASS is not configured for Kinetic Crew email.");
    const mailer=nodemailer.createTransport({host:"smtp.gmail.com",port:465,secure:true,auth:{user:smtpUser,pass:smtpPass}});
    const name=String(member.name||"Crew member");
    const username=String(member.username||"Not set");
    const safeName=esc(name), safeUsername=esc(username);
    const subject="Successfully Registered with Kinetic Crew";
    const text=`Hi ${name},

Your Kinetic Crew registration has been approved. Your place in the crew is confirmed.

YOUR CREW LOGIN
Username: ${username}
Password: The password you created during registration.

Open the Kinetic Crew app and sign in with your username and password.

Welcome aboard,
KINETIC CREW
Move together. Create together.`;
    const html=brandedEmail({
      eyebrow:"MEMBERSHIP APPROVED",
      title:"You're officially part of the crew.",
      subtitle:"Your registration is approved. Welcome to Kinetic Crew.",
      contentHtml:'<p style="margin:0 0 8px;color:#f2eee8;font-size:17px;font-weight:700;">Hey '+safeName+',</p><p style="margin:0 0 22px;color:#c2bec8;font-size:14px;line-height:1.7;">Your membership is now active. Sign in to the app and explore your crew space.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #55515e;border-radius:18px;background:#20212a;"><tr><td style="padding:18px 20px;"><div style="font-size:10px;letter-spacing:2px;color:#ff955d;font-weight:700;">YOUR CREW LOGIN</div><div style="padding-top:14px;color:#aaa5b1;font-size:11px;letter-spacing:1px;">USERNAME</div><div style="padding-top:5px;color:#f4f3ef;font-size:18px;font-weight:700;">@'+safeUsername+'</div><div style="height:1px;background:#ffffff22;margin:15px 0 12px;"></div><div style="color:#aaa5b1;font-size:11px;letter-spacing:1px;">PASSWORD</div><div style="padding-top:5px;color:#e9e7e1;font-size:14px;">The password you created during registration</div></td></tr></table><p style="margin:22px 0 0;color:#c2bec8;font-size:14px;line-height:1.7;">Keep your password private. The crew team will never ask you to share it.</p><p style="margin:22px 0 0;color:#f0eee8;font-size:14px;line-height:1.7;">Welcome aboard,<br><strong>KINETIC CREW TEAM</strong></p>',
      buttonLabel:"Enter the crew",
      buttonUrl:"https://kineticcrew.vercel.app",
      footerNote:"This is an automated membership email from Kinetic Crew. Never share your password."
    });

    await mailer.sendMail({
      from:{name:"Kinetic Crew",address:smtpUser},
      to:member.email,
      subject,
      text,
      html,
    });
    const sentAt=new Date().toISOString();
    const {error:markError}=await adminClient.from("crew_profiles").update({welcome_email_sent_at:sentAt,welcome_email_claimed_at:null}).eq("auth_id",targetId);
    if(markError) throw markError;
    return json({ok:true,message:"Member approved. Welcome email sent."});
  } catch(error) {
    console.error("send-member-welcome:",error);
    if(targetId) await adminClient.from("crew_profiles").update({welcome_email_claimed_at:null}).eq("auth_id",targetId).is("welcome_email_sent_at",null);
    return json({error:error instanceof Error?error.message:"Welcome email could not be sent."},500);
  }
});