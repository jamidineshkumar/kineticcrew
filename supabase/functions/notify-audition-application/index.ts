import { createClient } from "npm:@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{...cors,"Content-Type":"application/json"}});
function b64url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = ""; bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}
function pemBytes(pem: string) {
  const body = pem.replaceAll("-----BEGIN PRIVATE KEY-----", "").replaceAll("-----END PRIVATE KEY-----", "")
    .replaceAll("\n", "").replaceAll("\r", "").replaceAll(" ", "").replaceAll("\t", "");
  return Uint8Array.from(atob(body), c => c.charCodeAt(0));
}
function readKey(primary: string, legacy: string) {
  const raw = Deno.env.get(primary);
  if (raw) {
    try { const parsed = JSON.parse(raw); if (typeof parsed === "string") return parsed; if (parsed && typeof parsed === "object") return parsed.default || Object.values(parsed).find(v => typeof v === "string") || ""; }
    catch { return raw; }
  }
  return Deno.env.get(legacy) || "";
}
async function googleAccessToken() {
  const email = Deno.env.get("FCM_CLIENT_EMAIL");
  const privateKey = Deno.env.get("FCM_PRIVATE_KEY")?.replaceAll("\\n", "\n");
  if (!email || !privateKey) throw new Error("Firebase service-account secrets are incomplete.");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const claims = b64url(JSON.stringify({iss:email,scope:"https://www.googleapis.com/auth/firebase.messaging",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const unsigned = header + "." + claims;
  const key = await crypto.subtle.importKey("pkcs8",pemBytes(privateKey),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,new TextEncoder().encode(unsigned)));
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:unsigned+"."+b64url(signature)})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Could not authenticate with Firebase.");
  return data.access_token as string;
}
async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return [...digest].map(b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required."},405);
  let db: any = null;
  let activeApplicationId = "";
  try {
    const body=await req.json();
    const applicationId=String(body.applicationId||"").trim();
    activeApplicationId = applicationId;
    const trackingToken=String(body.trackingToken||"").trim();
    if(applicationId.length!==36 || !/^[a-f0-9]{64}$/i.test(trackingToken)) return json({error:"Invalid application notification request."},400);
    db=createClient(Deno.env.get("SUPABASE_URL")||"",readKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"");
    const {data:app,error:appError}=await db.from("crew_audition_applications").select("id,name,application_status,tracking_token_sha256").eq("id",applicationId).maybeSingle();
    if(appError) throw appError;
    if(!app || !app.tracking_token_sha256 || await sha256(trackingToken)!==app.tracking_token_sha256) return json({error:"Application verification failed."},403);
    if(app.application_status!=="submitted") return json({ok:true,skipped:true,message:"This application is no longer awaiting its initial review."});
    const {data:inserted,error:insertError}=await db.from("crew_audition_push_events").insert({application_id:applicationId,status:"sending"}).select("application_id").maybeSingle();
    if(insertError && insertError.code!=="23505") throw insertError;
    if(!inserted) {
      const {data:previous,error:previousError}=await db.from("crew_audition_push_events").select("status,sent_count").eq("application_id",applicationId).maybeSingle();
      if(previousError) throw previousError;
      if(previous?.status==="sent") return json({ok:true,alreadySent:true,sent:previous.sent_count});
      if(previous?.status==="sending") return json({ok:true,inProgress:true},202);
      const {error:retryError}=await db.from("crew_audition_push_events").update({status:"sending",last_error:null,updated_at:new Date().toISOString()}).eq("application_id",applicationId);
      if(retryError) throw retryError;
    }
    const {data:devices,error:devicesError}=await db.from("crew_push_tokens").select("token,crew_profiles!inner(role,approval_status)").eq("crew_profiles.approval_status","approved").in("crew_profiles.role",["admin","super_admin"]);
    if(devicesError) throw devicesError;
    const tokens=[...new Set((devices||[]).map((device:any)=>String(device.token)).filter(Boolean))];
    if(!tokens.length) {
      await db.from("crew_audition_push_events").update({status:"no_devices",sent_count:0,failed_count:0,last_error:"No registered Admin or Super Admin push devices.",updated_at:new Date().toISOString()}).eq("application_id",applicationId);
      return json({ok:true,sent:0,message:"No Admin or Super Admin devices are registered for push notifications yet."});
    }
    const projectId=Deno.env.get("FCM_PROJECT_ID");
    if(!projectId) throw new Error("FCM_PROJECT_ID secret is missing.");
    const accessToken=await googleAccessToken();
    const notificationId="audition-"+applicationId;
    const title="New audition application";
    const message=(String(app.name||"A student")+" submitted an application. Tap to review.").slice(0,180);
    const invalid:string[]=[],failures:string[]=[]; let sent=0;
    for(const token of tokens) {
      const response=await fetch("https://fcm.googleapis.com/v1/projects/"+projectId+"/messages:send",{
        method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},
        body:JSON.stringify({message:{
          token,notification:{title,body:message},
          webpush:{notification:{title,body:message,icon:"/icon.svg",badge:"/kc-notification-badge.svg",tag:notificationId,renotify:false},fcmOptions:{link:"https://kineticcrew.vercel.app/audition-admin.html"}},
          android:{priority:"HIGH",notification:{channel_id:"crew_updates",sound:"default",tag:notificationId}},
          data:{url:"/audition-admin.html",notificationId,applicationId}
        }})
      });
      if(response.ok) sent++;
      else {
        const detail=JSON.stringify(await response.json());
        if(detail.includes("UNREGISTERED")||detail.includes("registration-token-not-registered")) invalid.push(token);
        else failures.push(detail.slice(0,300));
      }
    }
    if(invalid.length) await db.from("crew_push_tokens").delete().in("token",invalid);
    const status=sent===tokens.length?"sent":"failed";
    await db.from("crew_audition_push_events").update({status,sent_count:sent,failed_count:failures.length+invalid.length,last_error:failures.length?failures.slice(0,3).join(" | "):null,updated_at:new Date().toISOString(),sent_at:sent>0?new Date().toISOString():null}).eq("application_id",applicationId);
    return json({ok:sent>0,sent,failed:failures.length+invalid.length,message:"Audition alert delivered to "+sent+" Admin / Super Admin device(s)."},sent>0?200:503);
  } catch(error) {
    console.error("notify-audition-application:",error);
    if (db && activeApplicationId.length === 36) {
      await db.from("crew_audition_push_events").update({status:"failed",last_error:String(error instanceof Error?error.message:error).slice(0,500),updated_at:new Date().toISOString()}).eq("application_id",activeApplicationId).catch(()=>{});
    }
    return json({error:error instanceof Error?error.message:"Audition application notification failed."},500);
  }
});