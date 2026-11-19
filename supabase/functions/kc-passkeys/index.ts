// Source deployed to Supabase Edge Function: kc-passkeys
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13.1.2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const unb64=(v:string)=>{const raw=atob(v.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-v.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 try{
  const authHeader=req.headers.get("Authorization")||"";
  if(!authHeader.startsWith("Bearer "))return json({error:"Sign in required."},401);
  const origin=req.headers.get("origin")||"",parsed=new URL(origin);
  if(parsed.protocol!=="https:"&&parsed.hostname!=="localhost")return json({error:"Passkeys require a secure HTTPS origin."},400);
  const rpID=parsed.hostname,url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}}),{data:userData,error:userError}=await userClient.auth.getUser();
  if(userError||!userData.user)return json({error:"Your session has expired. Sign in again."},401);
  const user=userData.user,admin=createClient(url,service),body=await req.json();
  const saveChallenge=async(challenge:string,purpose:string)=>{const {error}=await admin.from("kc_passkey_challenges").upsert({user_id:user.id,challenge,purpose,rp_id:rpID,origin,expires_at:new Date(Date.now()+300000).toISOString()});if(error)throw error;};
  const getChallenge=async(purpose:string)=>{const {data,error}=await admin.from("kc_passkey_challenges").select("*").eq("user_id",user.id).eq("purpose",purpose).gt("expires_at",new Date().toISOString()).maybeSingle();if(error||!data)throw new Error("Security challenge expired. Try again.");if(data.origin!==origin||data.rp_id!==rpID)throw new Error("Passkey belongs to a different app origin.");return data;};
  if(body.action==="register-options"){
   const {data:existing}=await admin.from("kc_passkey_credentials").select("credential_id").eq("user_id",user.id);
   const options=await generateRegistrationOptions({rpName:"Kinetic Crew",rpID,userID:new TextEncoder().encode(user.id),userName:user.email||user.id,userDisplayName:user.user_metadata?.full_name||user.email||"Kinetic Crew member",attestationType:"none",excludeCredentials:(existing||[]).map((x:any)=>({id:x.credential_id})),authenticatorSelection:{residentKey:"preferred",userVerification:"required"},timeout:60000});
   await saveChallenge(options.challenge,"registration");return json({options});
  }
  if(body.action==="register-verify"){
   const saved=await getChallenge("registration"),verified=await verifyRegistrationResponse({response:body.credential,expectedChallenge:saved.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
   if(!verified.verified||!verified.registrationInfo)throw new Error("Biometric registration was not verified.");
   const c=verified.registrationInfo.credential,{error}=await admin.from("kc_passkey_credentials").upsert({user_id:user.id,credential_id:c.id,public_key:b64(c.publicKey),counter:c.counter,transports:c.transports||[],rp_id:rpID,origin},{onConflict:"credential_id"});
   if(error)throw error;await admin.from("kc_passkey_challenges").delete().eq("user_id",user.id);return json({verified:true});
  }
  if(body.action==="authentication-options"){
   const {data:credentials,error}=await admin.from("kc_passkey_credentials").select("credential_id,transports").eq("user_id",user.id);if(error)throw error;if(!credentials?.length)throw new Error("No biometric credential is registered for this account.");
   const options=await generateAuthenticationOptions({rpID,allowCredentials:credentials.map((x:any)=>({id:x.credential_id,transports:x.transports||[]})),userVerification:"required",timeout:60000});
   await saveChallenge(options.challenge,"authentication");return json({options});
  }
  if(body.action==="authentication-verify"){
   const saved=await getChallenge("authentication"),credentialId=String(body.credential?.id||""),{data:stored,error}=await admin.from("kc_passkey_credentials").select("*").eq("user_id",user.id).eq("credential_id",credentialId).maybeSingle();
   if(error||!stored)throw new Error("This device is not registered for biometric unlock.");
   const verified=await verifyAuthenticationResponse({response:body.credential,expectedChallenge:saved.challenge,expectedOrigin:origin,expectedRPID:rpID,credential:{id:stored.credential_id,publicKey:unb64(stored.public_key),counter:Number(stored.counter||0),transports:stored.transports||[]},requireUserVerification:true});
   if(!verified.verified)throw new Error("Biometric authentication could not be verified.");
   const {error:updateError}=await admin.from("kc_passkey_credentials").update({counter:verified.authenticationInfo.newCounter,last_used_at:new Date().toISOString()}).eq("id",stored.id);if(updateError)throw updateError;
   await admin.from("kc_passkey_challenges").delete().eq("user_id",user.id);return json({verified:true});
  }
  if(body.action==="remove"){const {error}=await admin.from("kc_passkey_credentials").delete().eq("user_id",user.id);if(error)throw error;await admin.from("kc_passkey_challenges").delete().eq("user_id",user.id);return json({removed:true});}
  return json({error:"Unsupported passkey action."},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Passkey operation failed."},400);}
});
