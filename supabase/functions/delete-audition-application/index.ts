import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const authHeader=req.headers.get("Authorization")||"";
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await userClient.auth.getUser();
 if(authError||!authData.user)return json({error:"Sign in again before deleting an application."},401);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json();
  const id=String(body.applicationId||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"A valid application ID is required."},400);
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
  return json({ok:true,message:"Application, review history"+(videoPath?", audition video":"")+(result.account_deleted?", and audition login account":"")+" permanently deleted."});
 }catch(error){
  console.error("delete-audition-application:",error);
  return json({error:error instanceof Error?error.message:"Could not delete this application."},500);
 }
});