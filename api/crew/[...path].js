import { db } from "hatchable";
export const access = "user";
export const methods = ["GET","POST","PATCH"];
const fail=(res,status,error)=>res.status(status).json({error});
async function query(sql,params=[]){return await db.query(sql,params);}
async function provision(user){
  const email=(user.email||"").trim().toLowerCase();
  if(!email) throw new Error("Your sign-in account has no email address.");
  const name=(user.name||email.split("@")[0]||"Crew member").slice(0,100);
  const existing=await query("SELECT auth_id,email,name,role,created_at FROM crew_profiles WHERE auth_id=$1",[user.id]);
  if(existing.rows[0]) return existing.rows[0];
  const created=await query(
    "INSERT INTO crew_profiles(auth_id,email,name,role) SELECT $1,$2,$3,CASE WHEN NOT EXISTS (SELECT 1 FROM crew_profiles) THEN 'super_admin' ELSE 'member' END ON CONFLICT(auth_id) DO UPDATE SET email=EXCLUDED.email RETURNING auth_id,email,name,role,created_at",
    [user.id,email,name]
  );
  return created.rows[0];
}
async function profileFor(req){return provision(req.user);}
async function requireRole(profile,roles,res){if(!roles.includes(profile.role)){fail(res,403,"You do not have permission for this action.");return false;}return true;}
export default async function(req,res){
 try{
  const parts=Array.isArray(req.params.path)?req.params.path.map(String):[];
  const action=parts[0]||"bootstrap";
  const profile=await profileFor(req);
  if(profile.role==="super_admin"){
   const existingUpdates=await query("SELECT count(*)::int AS n FROM crew_announcements");
   if(Number(existingUpdates.rows[0]?.n||0)===0) await query("INSERT INTO crew_announcements(title,body,audience,author_id) VALUES($1,$2,'all',$3)",["Welcome to Kinetic Crew","Your Crew HQ is ready. Explore events, register for the next session and use attendance OTP on event day.",profile.auth_id]);
  }
  if(action==="bootstrap"&&req.method==="GET"){
   const ev=await query(`SELECT e.id,e.title,e.description,e.location,e.starts_at,e.capacity,e.created_at,
    (SELECT count(*)::int FROM crew_registrations r WHERE r.event_id=e.id) AS registration_count,
    EXISTS(SELECT 1 FROM crew_registrations r WHERE r.event_id=e.id AND r.member_id=$1) AS registered,
    EXISTS(SELECT 1 FROM crew_attendance a WHERE a.event_id=e.id AND a.member_id=$1) AS attended
    FROM crew_events e ORDER BY e.starts_at ASC`,[profile.auth_id]);
   const ann=await query(`SELECT a.id,a.title,a.body,a.audience,a.created_at,p.name AS author_name FROM crew_announcements a JOIN crew_profiles p ON p.auth_id=a.author_id WHERE a.audience='all' OR a.audience=$1 ORDER BY a.created_at DESC LIMIT 50`,[profile.role]);
   let members=[];
   if(profile.role!=="member"){const m=await query(`SELECT p.auth_id,p.email,p.name,p.role,p.created_at,(SELECT count(*)::int FROM crew_registrations r WHERE r.member_id=p.auth_id) event_count FROM crew_profiles p ORDER BY p.created_at DESC`);members=m.rows;}
   res.json({user:profile,events:ev.rows,announcements:ann.rows,members});
   return;
  }
  if(action==="events"&&req.method==="GET"){
   const ev=await query(`SELECT e.id,e.title,e.description,e.location,e.starts_at,e.capacity,
    (SELECT count(*)::int FROM crew_registrations r WHERE r.event_id=e.id) registration_count,
    EXISTS(SELECT 1 FROM crew_registrations r WHERE r.event_id=e.id AND r.member_id=$1) registered,
    EXISTS(SELECT 1 FROM crew_attendance a WHERE a.event_id=e.id AND a.member_id=$1) attended
    FROM crew_events e ORDER BY e.starts_at ASC`,[profile.auth_id]);res.json(ev.rows);return;
  }
  if(action==="events"&&req.method==="POST"){
   if(!await requireRole(profile,["admin","super_admin"],res))return;
   const {title,description="",location="",starts_at,capacity=100}=req.body||{};
   if(!String(title||"").trim()||!starts_at)return fail(res,400,"Event title and date are required.");
   const r=await query("INSERT INTO crew_events(title,description,location,starts_at,capacity,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[String(title).trim(),String(description).trim(),String(location).trim(),starts_at,Math.max(1,Math.min(10000,Number(capacity)||100)),profile.auth_id]);
   res.status(201).json({id:r.rows[0].id,message:"Event published"});return;
  }
  if(action==="register"&&req.method==="POST"){
   const eventId=String(req.body?.eventId||"");
   const e=await query("SELECT id,capacity,(SELECT count(*)::int FROM crew_registrations r WHERE r.event_id=crew_events.id) registration_count FROM crew_events WHERE id=$1",[eventId]);
   if(!e.rows[0])return fail(res,404,"Event not found.");
   const previous=await query("SELECT id FROM crew_registrations WHERE event_id=$1 AND member_id=$2",[eventId,profile.auth_id]);
   if(previous.rows[0]){res.json({message:"You're already registered."});return;}
   if(e.rows[0].registration_count>=e.rows[0].capacity)return fail(res,409,"This event is full.");
   await query("INSERT INTO crew_registrations(event_id,member_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[eventId,profile.auth_id]);
   res.status(201).json({message:"Registration confirmed."});return;
  }
  if(action==="otp"&&req.method==="POST"){
   const eventId=String(req.body?.eventId||"");
   const reg=await query("SELECT 1 FROM crew_registrations WHERE event_id=$1 AND member_id=$2",[eventId,profile.auth_id]);
   if(!reg.rows[0])return fail(res,403,"Register for this event before requesting an attendance OTP.");
   const present=await query("SELECT 1 FROM crew_attendance WHERE event_id=$1 AND member_id=$2",[eventId,profile.auth_id]);
   if(present.rows[0])return fail(res,409,"Attendance is already marked.");
   const b=new Uint32Array(1);crypto.getRandomValues(b);const code=String(b[0]%1000000).padStart(6,"0");
   const bytes=new TextEncoder().encode(code);const digest=await crypto.subtle.digest("SHA-256",bytes);
   const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
   const expires=new Date(Date.now()+5*60*1000).toISOString();
   await query("INSERT INTO crew_otps(event_id,member_id,code_hash,expires_at) VALUES($1,$2,$3,$4)",[eventId,profile.auth_id,hash,expires]);
   res.json({code,expiresAt:expires,message:"Show this code to an authorized admin. It expires in five minutes."});return;
  }
  if(action==="verify"&&req.method==="POST"){
   if(!await requireRole(profile,["admin","super_admin"],res))return;
   const {eventId,memberEmail,code}=req.body||{};
   if(!eventId||!/^[0-9]{6}$/.test(String(code||""))||!memberEmail)return fail(res,400,"Event, member email and six-digit OTP are required.");
   const m=await query("SELECT auth_id,name,email FROM crew_profiles WHERE lower(email)=lower($1)",[String(memberEmail).trim()]);
   if(!m.rows[0])return fail(res,404,"Member account not found.");const member=m.rows[0];
   const reg=await query("SELECT 1 FROM crew_registrations WHERE event_id=$1 AND member_id=$2",[String(eventId),member.auth_id]);
   if(!reg.rows[0])return fail(res,409,"Member is not registered for this event.");
   const attended=await query("SELECT 1 FROM crew_attendance WHERE event_id=$1 AND member_id=$2",[String(eventId),member.auth_id]);
   if(attended.rows[0])return fail(res,409,"Attendance already marked.");
   const ot=await query("SELECT id,code_hash,expires_at FROM crew_otps WHERE event_id=$1 AND member_id=$2 AND used=false ORDER BY created_at DESC LIMIT 1",[String(eventId),member.auth_id]);
   if(!ot.rows[0]||new Date(ot.rows[0].expires_at).getTime()<Date.now())return fail(res,400,"No active OTP. Ask the member to generate a new one.");
   const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(code)));
   const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
   if(hash!==ot.rows[0].code_hash)return fail(res,400,"Incorrect OTP.");
   await query("UPDATE crew_otps SET used=true WHERE id=$1 AND used=false",[ot.rows[0].id]);
   await query("INSERT INTO crew_attendance(event_id,member_id,marked_by) VALUES($1,$2,$3) ON CONFLICT(event_id,member_id) DO NOTHING",[String(eventId),member.auth_id,profile.auth_id]);
   res.json({message:"Attendance marked for "+member.name});return;
  }
  if(action==="attendance"&&req.method==="GET"){
   if(!await requireRole(profile,["admin","super_admin"],res))return;
   const eventId=String(req.query.eventId||"");if(!eventId)return fail(res,400,"Select an event.");
   const roster=await query(`SELECT p.name,p.email,r.registered_at,EXISTS(SELECT 1 FROM crew_attendance a WHERE a.event_id=r.event_id AND a.member_id=r.member_id) attended FROM crew_registrations r JOIN crew_profiles p ON p.auth_id=r.member_id WHERE r.event_id=$1 ORDER BY p.name`,[eventId]);
   const attendance=await query(`SELECT p.name,p.email,a.marked_at,m.name marked_by FROM crew_attendance a JOIN crew_profiles p ON p.auth_id=a.member_id JOIN crew_profiles m ON m.auth_id=a.marked_by WHERE a.event_id=$1 ORDER BY a.marked_at DESC`,[eventId]);
   res.json({roster:roster.rows,attendance:attendance.rows});return;
  }
  if(action==="announcements"&&req.method==="GET"){
   const a=await query("SELECT a.id,a.title,a.body,a.audience,a.created_at,p.name author_name FROM crew_announcements a JOIN crew_profiles p ON p.auth_id=a.author_id WHERE a.audience='all' OR a.audience=$1 ORDER BY a.created_at DESC LIMIT 50",[profile.role]);res.json(a.rows);return;
  }
  if(action==="announcements"&&req.method==="POST"){
   if(!await requireRole(profile,["admin","super_admin"],res))return;
   const {title,body,audience="all"}=req.body||{};
   if(!String(title||"").trim()||!String(body||"").trim())return fail(res,400,"Headline and message are required.");
   if(!["all","member","admin","super_admin"].includes(audience))return fail(res,400,"Invalid audience.");
   const a=await query("INSERT INTO crew_announcements(title,body,audience,author_id) VALUES($1,$2,$3,$4) RETURNING id",[String(title).trim(),String(body).trim(),audience,profile.auth_id]);res.status(201).json({id:a.rows[0].id,message:"Crew update published."});return;
  }
  if(action==="members"&&req.method==="GET"){
   if(!await requireRole(profile,["admin","super_admin"],res))return;
   const m=await query("SELECT p.auth_id,p.email,p.name,p.role,p.created_at,(SELECT count(*)::int FROM crew_registrations r WHERE r.member_id=p.auth_id) event_count FROM crew_profiles p ORDER BY p.created_at DESC");res.json(m.rows);return;
  }
  if(action==="role"&&req.method==="PATCH"){
   if(!await requireRole(profile,["super_admin"],res))return;
   const {authId,role}=req.body||{};if(!authId||!["admin","member"].includes(role))return fail(res,400,"Choose Member or Admin.");
   if(String(authId)===profile.auth_id)return fail(res,400,"You cannot change your own role.");
   const m=await query("UPDATE crew_profiles SET role=$1 WHERE auth_id=$2 RETURNING auth_id",[role,String(authId)]);
   if(!m.rows[0])return fail(res,404,"Crew account not found.");res.json({message:"Role updated."});return;
  }
  return fail(res,404,"Unknown crew route.");
 }catch(error){console.error("crew-api",error);return res.status(500).json({error:"The crew service hit an unexpected problem. Please try again."});}
}