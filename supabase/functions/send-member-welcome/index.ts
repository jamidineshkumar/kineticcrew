import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

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
    const html=`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Welcome to Kinetic Crew</title></head>
<body style="margin:0;padding:0;background:#080a0c;color:#f4f3ef;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#080a0c;padding:34px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#171b1e;border:1px solid #34393b;border-radius:26px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35);">
<tr><td style="padding:30px 30px 22px;background:linear-gradient(135deg,#242a2e 0%,#111518 100%);border-bottom:1px solid #34393b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td align="left" style="font-size:12px;letter-spacing:4px;font-weight:700;color:#e8a15f;">KINETIC CREW</td>
<td align="right"><span style="display:inline-block;padding:7px 11px;border:1px solid #76563b;border-radius:30px;color:#f0b77d;font-size:10px;letter-spacing:1.5px;">MEMBERSHIP UPDATE</span></td>
</tr></table>
<div style="padding-top:34px;">
<div style="width:42px;height:4px;border-radius:5px;background:#f08b3e;margin-bottom:18px;"></div>
<div style="font-size:30px;line-height:1.16;font-weight:700;letter-spacing:-.7px;color:#f7f5ef;">You're officially<br>part of the crew.</div>
<p style="margin:15px 0 0;color:#aeb4b5;font-size:15px;line-height:1.7;">Your registration is approved. Welcome to a community built around movement, creativity and showing up for one another.</p>
</div>
</td></tr>
<tr><td style="padding:28px 30px 30px;">
<p style="margin:0 0 8px;color:#f2eee8;font-size:17px;font-weight:700;">Hey ${safeName},</p>
<p style="margin:0 0 23px;color:#aeb4b5;font-size:14px;line-height:1.7;">Your Kinetic Crew membership is now active. You can sign in to the app and explore your crew space.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#202629;border:1px solid #3b4244;border-radius:18px;">
<tr><td style="padding:19px 20px 8px;">
<div style="font-size:10px;letter-spacing:2px;color:#e8a15f;font-weight:700;">YOUR CREW LOGIN</div>
<div style="padding-top:16px;color:#929b9d;font-size:11px;letter-spacing:1px;">USERNAME</div>
<div style="padding-top:5px;color:#f4f3ef;font-size:18px;font-weight:700;">@${safeUsername}</div>
<div style="height:1px;background:#3a4143;margin:17px 0 13px;"></div>
<div style="color:#929b9d;font-size:11px;letter-spacing:1px;">PASSWORD</div>
<div style="padding:5px 0 13px;color:#e9e7e1;font-size:14px;">The password you created during registration</div>
</td></tr></table>
<p style="margin:23px 0 0;color:#aeb4b5;font-size:14px;line-height:1.7;">Open the Kinetic Crew app and sign in using the credentials above. Keep your password private — the crew team will never ask you to share it.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:25px 0 8px;"><tr><td style="background:#e9893f;border-radius:13px;">
<a href="https://kineticcrew.vercel.app" style="display:inline-block;padding:15px 24px;color:#171411;text-decoration:none;font-size:14px;font-weight:700;">Enter the crew&nbsp; →</a>
</td></tr></table>
<div style="margin-top:27px;padding-top:21px;border-top:1px solid #343b3d;">
<p style="margin:0;color:#f0eee8;font-size:14px;line-height:1.7;">Welcome aboard,<br><strong style="letter-spacing:1.5px;">KINETIC CREW TEAM</strong></p>
<p style="margin:13px 0 0;color:#d89b65;font-size:11px;letter-spacing:2px;">MOVE TOGETHER. CREATE TOGETHER.</p>
</div>
</td></tr>
</table>
<p style="margin:18px 0 0;color:#666e70;font-size:10px;line-height:1.6;text-align:center;">This is an automated membership email from Kinetic Crew.<br>Please do not reply with your password or sensitive account details.</p>
</td></tr></table>
</body></html>`;
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