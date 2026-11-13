import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.13.3";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 try{
  const authHeader=req.headers.get("Authorization")||"",authMatch=authHeader.match(/^Bearer\s+(.+)$/i),token=authMatch?.[1]||"";
  if(!token||token===authHeader)return reply({error:"Sign in to use KC Meet."},401);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")!,anonKey=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,apiKey=Deno.env.get("LIVEKIT_API_KEY")!,apiSecret=Deno.env.get("LIVEKIT_API_SECRET")!,livekitUrl=Deno.env.get("LIVEKIT_URL")!;
  if(![supabaseUrl,anonKey,serviceKey,apiKey,apiSecret,livekitUrl].every(Boolean))return reply({error:"KC Meet server configuration is incomplete. Check Supabase Edge Function secrets."},503);
  const authClient=createClient(supabaseUrl,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await authClient.auth.getUser(token);
  if(authError||!authData.user)return reply({error:"Your session is invalid. Sign in again."},401);
  const userId=authData.user.id,admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await admin.from("crew_profiles").select("auth_id,name,email,role,approval_status").eq("auth_id",userId).maybeSingle();
  if(profileError)throw profileError;
  if(!profile||profile.approval_status!=="approved")return reply({error:"Only approved Kinetic Crew members can use KC Meet."},403);
  const {data:blocked,error:blockError}=await admin.from("crew_member_blocks").select("blocked_auth_id").eq("blocked_auth_id",userId).maybeSingle();
  if(blockError)throw blockError;
  if(blocked)return reply({error:"Your Kinetic Crew access is restricted."},403);
  const body=await req.json().catch(()=>({})),action=String(body.action||"");
  if(!["create","join","end","mute"].includes(action))return reply({error:"Choose create, join, end or mute."},400);
  if(action==="create"&&!["admin","super_admin"].includes(profile.role))return reply({error:"Only admins and super admins can create KC Meet rooms."},403);
  const livekitHttpUrl=livekitUrl.replace(/^wss:/i,"https:").replace(/^ws:/i,"http:");
  const roomService=new RoomServiceClient(livekitHttpUrl,apiKey,apiSecret);
  let roomName="",isHost=false,meetingTitle="",code="";
  if(action==="create"){
   meetingTitle=String(body.title||"Kinetic Crew Meeting").trim().slice(0,80)||"Kinetic Crew Meeting";
   const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",random=new Uint8Array(6);crypto.getRandomValues(random);
   code="KC-"+Array.from(random,n=>alphabet[n%alphabet.length]).join("");
   roomName="kc-"+code.toLowerCase();
   await roomService.createRoom({name:roomName,emptyTimeout:300,maxParticipants:50,metadata:JSON.stringify({code,title:meetingTitle,hostId:userId,createdAt:new Date().toISOString()})});
   try {
    await admin.from("crew_announcements").insert({
     title:"KC Meet invitation: "+meetingTitle,
     body:"An admin has started a Kinetic Crew meeting. Join using code "+code+". Open KC Meet in the app to join.",
     audience:"all",
     author_id:userId
    });
   } catch (inviteError) { console.warn("KC Meet invitation announcement could not be created",inviteError); }
   isHost=true;
  }else{
   code=String(body.code||"").trim().toUpperCase();
   if(!/^KC-[A-HJ-NP-Z2-9]{6}$/.test(code))return reply({error:"Enter a valid KC Meet code."},400);
   roomName="kc-"+code.toLowerCase();
   const rooms=await roomService.listRooms([roomName]),room=rooms.find(item=>item.name===roomName);
   if(!room)return reply({error:"Meeting not found. Check the code or ask the host for a new one."},404);
   let metadata:Record<string,unknown>={};try{metadata=JSON.parse(room.metadata||"{}");}catch{}
   meetingTitle=String(metadata.title||"Kinetic Crew Meeting");isHost=metadata.hostId===userId;
   if(action==="end"){
    if(!isHost)return reply({error:"Only the meeting host can end this meeting."},403);
    await roomService.deleteRoom(roomName);
    return reply({ended:true,code});
   }
   if(action==="mute"){
    if(!isHost)return reply({error:"Only the meeting host can mute participants."},403);
    const identity=String(body.identity||"").slice(0,128),trackSid=String(body.trackSid||"").slice(0,128);
    if(!identity||!trackSid)return reply({error:"Participant or track is missing."},400);
    await roomService.mutePublishedTrack(roomName,identity,trackSid);
    return reply({muted:true,identity});
   }
  }
  const participantName=String(profile.name||profile.email||"Crew Member").slice(0,80);
  const accessToken=new AccessToken(apiKey,apiSecret,{identity:userId,name:participantName,ttl:"2h"});
  accessToken.addGrant({roomJoin:true,room:roomName,canPublish:true,canSubscribe:true,canPublishData:true});
  return reply({token:await accessToken.toJwt(),serverUrl:livekitUrl,roomName,code,title:meetingTitle,isHost,participantName});
 }catch(error){console.error("kc-meet error",error);return reply({error:"KC Meet could not prepare this room. Please try again."},500);}
});