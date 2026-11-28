/* Kinetic Gram Chat — WhatsApp-style private, group and community messaging. */
(()=>{'use strict';
const client=window.kcSupabase;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>window.crypto?.randomUUID?.()||('kg-'+Date.now()+'-'+Math.random().toString(36).slice(2));
const state={user:null,profile:null,people:[],members:[],conversations:[],communities:[],active:null,messages:[],attachments:[],receipts:[],reactions:[],signed:new Map(),channel:null,typingTimer:null,typingSent:0,reply:null,search:'',tab:'chats',showArchived:false,loading:false,mediaRecorder:null,mediaChunks:[],recording:false};
const fmt=t=>{const d=new Date(t);return isNaN(d)?'':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
const shortDate=t=>{const d=new Date(t),now=new Date();return d.toDateString()===now.toDateString()?fmt(t):d.toLocaleDateString([],{day:'2-digit',month:'short'})};
const avatar=(p,label='KC')=>p?.avatar_url?'<img class="kg-wa-avatar" src="'+esc(p.avatar_url)+'" alt="">':'<span class="kg-wa-avatar kg-wa-avatar-fallback">'+esc((p?.name||label).split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())+'</span>';
const notify=msg=>{const n=$('#toast');if(n){n.textContent=msg;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2600)}else console.info(msg)};
const call=async(name,args={})=>{const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data};
const profileById=id=>state.people.find(p=>String(p.auth_id)===String(id))||{auth_id:id,name:'Crew member'};
const activeConv=()=>state.conversations.find(c=>String(c.id)===String(state.active));
function page(){return '<section class="kg-wa-app" id="kgWaApp">'+
'<header class="kg-wa-top"><div class="kg-wa-title"><span class="kg-wa-brand">K</span><div><b>Kinetic Gram</b><small>PRIVATE MESSAGING</small></div></div><div class="kg-wa-top-actions"><button type="button" data-kg-new-menu aria-label="New chat or group">＋</button><button type="button" data-kg-menu aria-label="More options">⋮</button></div></header>'+
'<label class="kg-wa-search"><span>⌕</span><input id="kgWaSearch" type="search" placeholder="Search chats, people or messages…" autocomplete="off"><button type="button" data-kg-search-clear hidden>×</button></label>'+
'<nav class="kg-wa-tabs"><button type="button" data-kg-tab="chats" class="active">Chats</button><button type="button" data-kg-tab="groups">Groups</button><button type="button" data-kg-tab="communities">Communities</button></nav>'+
'<div class="kg-wa-list-view" id="kgWaListView"><div class="kg-wa-list-tools"><button type="button" data-kg-archived>▣ Archived <span id="kgWaArchivedCount">0</span></button><span id="kgWaTotalCount"></span><button type="button" id="kgWaCreateGroup" data-kg-new="group" hidden>Create group ＋</button></div><div id="kgWaList"><div class="kg-wa-loading">Loading your conversations…</div></div></div>'+
'<section class="kg-wa-thread-view" id="kgWaThreadView" hidden></section>'+
'<div class="kg-wa-fab-wrap"><button type="button" class="kg-wa-fab" data-kg-new="direct" aria-label="Start a new chat">＋</button></div>'+
'<div class="kg-wa-modal-root" id="kgWaModalRoot"></div><input id="kgWaFileInput" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" multiple hidden>'+
'</section>'}
window.kcGramChatPage=page;
function memberFor(conv){return state.members.filter(m=>String(m.conversation_id)===String(conv.id))}
function directTitle(conv){const other=memberFor(conv).find(m=>String(m.user_id)!==String(state.user.id));return other?profileById(other.user_id).name||'Crew member':'Private chat'}
function lastMessage(conv){return state.messagesPreview?.[conv.id]||null}
function listMarkup(){
 const q=state.search.toLowerCase(),isArchived=state.showArchived;
 if(state.tab==='communities')return communityMarkup();
 let rows=state.conversations.filter(c=>{
  const mine=c.membership||{};
  if(!!mine.archived_at!==isArchived)return false;
  if(state.tab==='groups'&&c.kind!=='group')return false;
  if(state.tab==='chats'&&c.kind==='community')return false;
  const title=c.kind==='direct'?directTitle(c):(c.title||'Group');
  const last=lastMessage(c),hay=(title+' '+(last?.body||'')).toLowerCase();
  return !q||hay.includes(q);
 }).sort((a,b)=>{
  const ap=a.membership?.pinned_at?1:0,bp=b.membership?.pinned_at?1:0;
  return bp-ap||new Date(b.last_message_at)-new Date(a.last_message_at);
 });
 $('#kgWaTotalCount') && ($('#kgWaTotalCount').textContent=rows.length+' conversations');
 $('#kgWaArchivedCount') && ($('#kgWaArchivedCount').textContent=state.conversations.filter(c=>c.membership?.archived_at).length);
 if(!rows.length)return '<div class="kg-wa-empty"><span>✉</span><b>'+(isArchived?'No archived chats':q?'No matching chats':state.tab==='groups'?'No groups yet':'No conversations yet')+'</b><small>'+(isArchived?'Archived conversations will appear here.':q?'Try another name or message.':state.tab==='groups'?'Create a group and add your crew members.':'Start a private chat, create a group or join a community.')+'</small><button type="button" data-kg-new="'+(state.tab==='groups'?'group':'direct')+'">'+(state.tab==='groups'?'Create a group':'Start a chat')+'</button></div>';
 return rows.map(c=>{
  const title=c.kind==='direct'?directTitle(c):(c.title||'Group chat'),other=c.kind==='direct'?profileById(memberFor(c).find(m=>String(m.user_id)!==String(state.user.id))?.user_id):null;
  const last=lastMessage(c),unread=state.unreadByConversation?.[c.id]||0;
  const preview=last?(last.deleted_at?'Message deleted':last.message_type==='image'?'▧ Photo':last.message_type==='video'?'▣ Video':last.message_type==='voice'?'◖ Voice message':last.message_type==='document'?'▤ Document':last.body||'Attachment'):(c.kind==='group'?'Group created':'Start the conversation');
  return '<article class="kg-wa-chat-row '+(c.membership?.pinned_at?'is-pinned':'')+'" data-chat-row="'+esc(c.id)+'"><button type="button" class="kg-wa-chat-open" data-kg-open="'+esc(c.id)+'">'+avatar(other||{name:title,avatar_url:c.avatar_url},title)+'<span class="kg-wa-chat-copy"><b>'+esc(title)+'</b><small>'+esc(preview)+'</small></span><span class="kg-wa-chat-meta"><time>'+esc(last?shortDate(last.created_at):shortDate(c.last_message_at))+'</time>'+(unread?'<i class="kg-wa-unread">'+(unread>99?'99+':unread)+'</i>':'')+(c.membership?.muted_until?'<small>◖</small>':'')+'</span></button><button type="button" class="kg-wa-row-menu" data-kg-row-menu="'+esc(c.id)+'" aria-label="Chat options">⋮</button></article>';
 }).join('');
}
function communityMarkup(){
 const q=state.search.toLowerCase(),rows=state.communities.filter(c=>(c.name+' '+c.description).toLowerCase().includes(q));
 const joined=rows.filter(c=>c.is_member),discover=rows.filter(c=>!c.is_member);
 const block=(title,list,join)=>'<div class="kg-wa-community-section"><h3>'+title+'</h3>'+(list.length?list.map(c=>'<article class="kg-wa-chat-row"><button type="button" class="kg-wa-chat-open" data-kg-community="'+esc(c.id)+'"><span class="kg-wa-avatar kg-wa-avatar-fallback">◎</span><span class="kg-wa-chat-copy"><b>'+esc(c.name)+'</b><small>'+esc(c.member_count||0)+' members · '+esc(c.description||'Community')+'</small></span><span class="kg-wa-chat-meta">'+(join?'':'›')+'</span></button>'+(join?'<button type="button" class="kg-wa-row-join" data-kg-join-community="'+esc(c.id)+'">Join</button>':'')+'</article>').join(''):'<p class="kg-wa-muted">Nothing here yet.</p>')+'</div>';
 return '<div class="kg-wa-community-actions"><button type="button" data-kg-new-community>Create community ＋</button><button type="button" data-kg-new="group">New group</button></div>'+block('Your communities',joined,false)+block('Discover communities',discover,true);
}
async function loadData(){
 if(!client)throw Error('Kinetic Gram messaging is not connected to Supabase.');
 const {data:authData,error:authError}=await client.auth.getUser();if(authError)throw authError;
 const user=authData?.user;if(!user)throw Error('Sign in again to open Kinetic Gram chats.');
 state.user={id:user.id,name:user.user_metadata?.full_name||user.email?.split('@')[0]||'Crew member'};
 const [directory,membership,communities]=await Promise.all([
  client.rpc('crew_profile_directory',{}),
  client.from('kg_conversation_members').select('conversation_id,role,last_read_at,archived_at,pinned_at,muted_until,conversation:kg_conversations(id,kind,title,description,avatar_path,community_id,created_by,created_at,last_message_at)').eq('user_id',user.id),
  call('kg_list_communities',{})
 ]);
 if(directory.error)throw directory.error;if(membership.error)throw membership.error;
 state.people=Array.isArray(directory.data)?directory.data:[];
 state.profile=profileById(user.id);state.communities=Array.isArray(communities)?communities:[];
 const rows=(membership.data||[]).filter(m=>m.conversation).map(m=>({...m.conversation,membership:m}));
 state.conversations=rows;
 state.members=[];
 if(rows.length){
  const ids=rows.map(c=>c.id);
  const mr=await client.from('kg_conversation_members').select('conversation_id,user_id,role,joined_at').in('conversation_id',ids);
  if(mr.error)throw mr.error;state.members=mr.data||[];
  const msgs=await client.from('kg_messages').select('id,conversation_id,sender_id,body,message_type,created_at,deleted_at').in('conversation_id',ids).order('created_at',{ascending:false}).limit(500);
  if(msgs.error)throw msgs.error;
  state.messagesPreview={};(msgs.data||[]).forEach(m=>{if(!state.messagesPreview[m.conversation_id])state.messagesPreview[m.conversation_id]=m;});
  const messageIds=(msgs.data||[]).filter(m=>m.sender_id!==user.id).map(m=>m.id);
  state.unreadByConversation={};
  if(messageIds.length){
   const rr=await client.from('kg_message_receipts').select('message_id,read_at').eq('user_id',user.id).in('message_id',messageIds);
   if(rr.error)throw rr.error;
   const unread=new Set((rr.data||[]).filter(x=>!x.read_at).map(x=>x.message_id));
   (msgs.data||[]).forEach(m=>{if(unread.has(m.id))state.unreadByConversation[m.conversation_id]=(state.unreadByConversation[m.conversation_id]||0)+1;});
  }
 }
 renderList();
 const requested=window.__kgOpenConversation;
 if(requested){window.__kgOpenConversation=null;openConversation(String(requested)).catch(err=>notify(err.message||'Could not open chat.'));}
 const unreadTotal=Object.values(state.unreadByConversation||{}).reduce((a,b)=>a+b,0);
 const chatShortcut=document.querySelector('[data-gram-route="gram-chat"]');
 if(chatShortcut){chatShortcut.dataset.unread=String(unreadTotal);chatShortcut.setAttribute('aria-label',unreadTotal?('Chats, '+unreadTotal+' unread'):'Chats');}
}
function renderList(){const list=$('#kgWaList');if(list)list.innerHTML=listMarkup();const createGroup=$('#kgWaCreateGroup');if(createGroup)createGroup.hidden=state.tab!=='groups'||state.showArchived;}
function renderThread(){
 const conv=activeConv(),root=$('#kgWaThreadView');if(!conv||!root)return;
 const direct=conv.kind==='direct',other=direct?profileById(memberFor(conv).find(m=>String(m.user_id)!==String(state.user.id))?.user_id):null;
 const title=direct?(other?.name||'Private chat'):(conv.title||'Group chat');
 const online=state.onlineUsers?.size||0;
 root.innerHTML='<header class="kg-wa-thread-head"><button type="button" data-kg-back aria-label="Back to chats">‹</button>'+avatar(other||{name:title,avatar_url:conv.avatar_url},title)+'<button type="button" class="kg-wa-thread-person" data-kg-chat-info><b>'+esc(title)+'</b><small>'+(direct?(online?'online':'tap for contact info'):(memberFor(conv).length+' members · '+(online?online+' online':'group conversation')))+'</small></button><button type="button" data-kg-chat-search aria-label="Search messages">⌕</button><button type="button" data-kg-chat-menu aria-label="Chat menu">⋮</button></header>'+
 '<div class="kg-wa-message-search" id="kgWaMessageSearch" hidden><input id="kgWaMessageQuery" placeholder="Search in conversation…"><button type="button" data-kg-close-message-search>×</button></div>'+
 '<div class="kg-wa-messages" id="kgWaMessages">'+messageMarkup()+'</div>'+
 '<div class="kg-wa-typing" id="kgWaTyping" hidden>typing…</div>'+
 (state.reply?'<div class="kg-wa-reply-preview"><span><b>Replying to '+esc(state.reply.sender_name||'message')+'</b><small>'+esc(state.reply.body||'Attachment')+'</small></span><button type="button" data-kg-cancel-reply>×</button></div>':'')+
 '<form class="kg-wa-composer" id="kgWaComposer"><button type="button" class="kg-wa-plus" data-kg-attach aria-label="Attach">＋</button><textarea id="kgWaText" name="body" rows="1" maxlength="10000" placeholder="Message" autocomplete="off"></textarea><button type="button" class="kg-wa-emoji" data-kg-emoji aria-label="Emoji">☺</button><button type="button" class="kg-wa-voice" data-kg-voice aria-label="Record voice note">◖</button><button type="submit" class="kg-wa-send" aria-label="Send">➤</button></form>'+
 '<div class="kg-wa-attach-sheet" id="kgWaAttachSheet" hidden><button type="button" data-kg-file-kind="image">▧<span>Photos</span></button><button type="button" data-kg-file-kind="video">▣<span>Video</span></button><button type="button" data-kg-file-kind="document">▤<span>Document</span></button><button type="button" data-kg-file-kind="audio">♫<span>Audio</span></button><button type="button" data-kg-gif>GIF<span>GIF</span></button><button type="button" data-kg-location>⌖<span>Location</span></button></div>';
 root.hidden=false;$('#kgWaListView').hidden=true;$('.kg-wa-fab-wrap').hidden=true;
 const box=$('#kgWaMessages');if(box)box.scrollTop=box.scrollHeight;
}
function messageMarkup(){
 const people=state.people,uid=state.user.id;
 return state.messages.map(m=>{
  const own=String(m.sender_id)===uid,person=profileById(m.sender_id),deleted=!!m.deleted_at;
  const files=(state.attachmentsByMessage?.[m.id]||[]).map(a=>{
   const url=state.signed.get(a.storage_path)||'#',mime=a.mime_type||'';
   if(mime.startsWith('image/'))return '<a class="kg-wa-media" href="'+esc(url)+'" target="_blank"><img src="'+esc(url)+'" alt="'+esc(a.file_name)+'" loading="lazy"></a>';
   if(mime.startsWith('video/'))return '<video class="kg-wa-media-video" src="'+esc(url)+'" controls playsinline preload="metadata"></video>';
   if(mime.startsWith('audio/'))return '<audio class="kg-wa-audio" src="'+esc(url)+'" controls></audio>';
   return '<a class="kg-wa-document" href="'+esc(url)+'" target="_blank" rel="noopener">▤ <span><b>'+esc(a.file_name)+'</b><small>'+esc(mime)+' · '+Math.ceil(Number(a.size_bytes||0)/1024)+' KB</small></span> ↗</a>';
  }).join('');
  const gif=m.message_type==='gif'&&/^https:\/\/\S+/i.test(m.body||'')?'<img class="kg-wa-gif" src="'+esc(m.body)+'" alt="GIF">':'';
  const receipt=(state.receiptsByMessage?.[m.id]||[]),delivered=receipt.filter(x=>x.delivered_at).length,read=receipt.filter(x=>x.read_at).length;
  const total=memberFor(activeConv()||{}).filter(x=>String(x.user_id)!==uid).length;
  const tick=own?(total&&read>=total?'<i class="is-read">✓✓</i>':delivered?'<i>✓✓</i>':'<i>✓</i>'):'';
  const reactions=(state.reactionsByMessage?.[m.id]||[]);
  const reply=m.reply_to_id?state.messages.find(x=>String(x.id)===String(m.reply_to_id)):null;
  return '<article class="kg-wa-message '+(own?'own':'')+'" data-kg-message="'+esc(m.id)+'">'+
   (!own&&activeConv()?.kind!=='direct'?'<small class="kg-wa-sender">'+esc(person.name||'Crew member')+'</small>':'')+
   (reply?'<div class="kg-wa-replied"><b>'+esc(profileById(reply.sender_id).name||'Reply')+'</b><span>'+esc(reply.body||'Attachment')+'</span></div>':'')+
   (m.forwarded_from_id?'<small class="kg-wa-forwarded">↪ Forwarded</small>':'')+
   (deleted?'<p class="kg-wa-deleted">This message was deleted</p>':(m.body?'<p>'+esc(m.body)+'</p>':'')+files+gif)+
   '<footer><time>'+esc(fmt(m.created_at))+'</time>'+(m.edited_at?'<small>edited</small>':'')+tick+'</footer>'+
   (reactions.length?'<div class="kg-wa-reactions">'+reactions.map(r=>'<button type="button" data-kg-react="'+esc(m.id)+'" data-kg-emoji="'+esc(r.emoji)+'">'+esc(r.emoji)+'</button>').join('')+'</div>':'')+
   '</article>';
 }).join('')||'<div class="kg-wa-thread-empty"><span>✉</span><b>This is the beginning</b><small>Send a message to start the conversation.</small></div>';
}
async function loadMessages(id){
 const m=await client.from('kg_messages').select('*').eq('conversation_id',id).order('created_at',{ascending:true}).limit(300);
 if(m.error)throw m.error;
 state.messages=m.data||[];
 const ids=state.messages.map(x=>x.id);
 let attachments=[],receipts=[],reactions=[];
 if(ids.length){
  const results=await Promise.all([
   client.from('kg_message_attachments').select('*').in('message_id',ids),
   client.from('kg_message_receipts').select('*').in('message_id',ids),
   client.from('kg_message_reactions').select('*').in('message_id',ids)
  ]);
  for(const r of results)if(r.error)throw r.error;
  attachments=results[0].data||[];receipts=results[1].data||[];reactions=results[2].data||[];
 }
 state.attachmentsByMessage={};attachments.forEach(x=>(state.attachmentsByMessage[x.message_id]??=[]).push(x));
 state.receiptsByMessage={};receipts.forEach(x=>(state.receiptsByMessage[x.message_id]??=[]).push(x));
 state.reactionsByMessage={};reactions.forEach(x=>(state.reactionsByMessage[x.message_id]??=[]).push(x));
 const paths=attachments.map(x=>x.storage_path).filter(Boolean);
 if(paths.length){const signed=await client.storage.from('kg-chat-media').createSignedUrls(paths,3600);if(!signed.error)(signed.data||[]).forEach(x=>{if(x.path&&x.signedUrl)state.signed.set(x.path,x.signedUrl)});}
 const {error:readError}=await client.rpc('kg_mark_conversation_read',{p_conversation_id:id});if(readError)console.warn('Read receipt update deferred',readError);
 const thread=$('#kgWaMessages');if(thread){thread.innerHTML=messageMarkup();thread.scrollTop=thread.scrollHeight;}
}
async function openConversation(id){
 state.active=id;window.kcGramActiveConversation=String(id);state.reply=null;
 await loadMessages(id);
 renderThread();
 subscribeConversation(id);
}
function subscribeConversation(id){
 if(state.channel){client.removeChannel(state.channel);state.channel=null;}
 const ch=client.channel('kg-live-'+id,{config:{presence:{key:state.user.id},broadcast:{self:false}}});
 ch.on('postgres_changes',{event:'*',schema:'public',table:'kg_messages',filter:'conversation_id=eq.'+id},()=>{loadMessages(id).catch(e=>console.warn('Chat refresh failed',e));});
 ch.on('postgres_changes',{event:'*',schema:'public',table:'kg_message_receipts'},payload=>{if(state.messages.some(m=>m.id===payload.new?.message_id||m.id===payload.old?.message_id))loadMessages(id).catch(()=>{});});
 ch.on('broadcast',{event:'typing'},payload=>{const p=payload.payload||{};if(p.user_id===state.user.id)return;const el=$('#kgWaTyping');if(el){el.hidden=!p.typing;el.textContent=(p.name||'Someone')+' is typing…';clearTimeout(state.typingTimer);if(p.typing)state.typingTimer=setTimeout(()=>{if(el)el.hidden=true},2600);}});
 ch.on('presence',{event:'sync'},()=>{const pres=ch.presenceState();state.onlineUsers=new Set(Object.values(pres).flat().map(x=>x.user_id).filter(x=>x&&x!==state.user.id));const sub=$('.kg-wa-thread-person small');if(sub&&activeConv()?.kind==='direct')sub.textContent=state.onlineUsers.size?'online':'tap for contact info';});
 ch.subscribe(async status=>{if(status==='SUBSCRIBED'){await ch.track({user_id:state.user.id,name:state.profile?.name||state.user.name,online_at:new Date().toISOString()});}});
 state.channel=ch;
}

async function sendMessagePush(messageId,conversationId){
 try{
  const {data,error}=await client.auth.getSession();if(error)throw error;
  const token=data?.session?.access_token;if(!token)return;
  const cfg=window.KC_CONFIG||{},base=String(cfg.supabaseUrl||'').replace(/\/+$/,'');
  if(!base||!cfg.supabaseAnonKey)return;
  const response=await fetch(base+'/functions/v1/send-crew-notification',{
   method:'POST',
   headers:{'Content-Type':'application/json',apikey:cfg.supabaseAnonKey,Authorization:'Bearer '+token},
   body:JSON.stringify({action:'message',messageId:String(messageId),conversationId:String(conversationId)})
  });
  if(!response.ok){const result=await response.json().catch(()=>({}));console.warn('Kinetic Gram push delivery was not confirmed:',result.error||response.status);}
 }catch(error){console.warn('Kinetic Gram push delivery deferred:',error.message||error);}
}
async function sendText(body,type='text',replyId=null,forwardId=null){
 const conv=activeConv();if(!conv)throw Error('Open a conversation first.');
 const id=await call('kg_send_message',{p_conversation_id:conv.id,p_body:body,p_message_type:type,p_reply_to_id:replyId,p_forwarded_from_id:forwardId});
 void sendMessagePush(id,conv.id);
 state.reply=null;const input=$('#kgWaText');if(input)input.value='';
 await loadMessages(conv.id);await loadData();renderThread();subscribeConversation(conv.id);
}
async function uploadFiles(files){
 const conv=activeConv();if(!conv)throw Error('Open a conversation first.');
 for(const file of files){
  if(file.size>100*1024*1024)throw Error(file.name+' is larger than 100 MB.');
  const mime=file.type||'application/octet-stream';
  const type=mime.startsWith('image/')?(mime==='image/gif'?'gif':'image'):mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'document';
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'attachment';
  const path=state.user.id+'/'+conv.id+'/'+uid()+'_'+safe;
  const up=await client.storage.from('kg-chat-media').upload(path,file,{upsert:false,contentType:mime,cacheControl:'3600'});if(up.error)throw up.error;
  try{
   const messageId=await call('kg_send_message',{p_conversation_id:conv.id,p_body:'',p_message_type:type,p_reply_to_id:state.reply?.id||null,p_forwarded_from_id:null});
   const duration=type==='audio'&&Number.isFinite(file.duration)?file.duration:null;
   await call('kg_add_message_attachment',{p_message_id:messageId,p_storage_path:path,p_file_name:file.name,p_mime_type:mime,p_size_bytes:file.size,p_duration_seconds:duration});
   void sendMessagePush(messageId,conv.id);
  }catch(error){await client.storage.from('kg-chat-media').remove([path]);throw error;}
 }
 state.reply=null;await loadMessages(conv.id);await loadData();renderThread();subscribeConversation(conv.id);
}
function modal(content){const root=$('#kgWaModalRoot');if(root)root.innerHTML='<div class="kg-wa-modal-backdrop" data-kg-modal-backdrop><section class="kg-wa-modal" role="dialog" aria-modal="true">'+content+'</section></div>';}
function closeModal(){$('#kgWaModalRoot')&&($('#kgWaModalRoot').innerHTML='');}
function memberPicker(){const picked=[];return (state.people||[]).filter(p=>String(p.auth_id)!==state.user.id).map(p=>'<label class="kg-wa-person-option">'+avatar(p,p.name)+'<span><b>'+esc(p.name||'Crew member')+'</b><small>@'+esc(p.username||'crew-member')+'</small></span><input type="checkbox" name="member" value="'+esc(p.auth_id)+'"></label>').join('');}
function newDirectModal(){
 const people=(state.people||[]).filter(p=>String(p.auth_id)!==state.user.id);
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">NEW CONVERSATION</span><h2>Start a private chat</h2><input class="kg-wa-modal-search" id="kgWaPeopleSearch" placeholder="Search crew members…"><div class="kg-wa-person-list" id="kgWaPeopleList">'+(people.map(p=>'<button type="button" class="kg-wa-person-option kg-wa-start-person" data-kg-start-direct="'+esc(p.auth_id)+'">'+avatar(p,p.name)+'<span><b>'+esc(p.name||'Crew member')+'</b><small>@'+esc(p.username||'crew-member')+'</small></span><i>›</i></button>').join('')||'<p class="kg-wa-muted">No other approved crew profiles found.</p>')+'</div>');
}
function newGroupModal(){
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">GROUP CHAT</span><h2>Create a group</h2><form id="kgWaGroupForm"><label>Group name<input name="title" required maxlength="80" placeholder="e.g. Kinetic Crew Rehearsals"></label><label>Description<textarea name="description" maxlength="500" placeholder="What is this group for?"></textarea></label><div class="kg-wa-person-list">'+memberPicker()+'</div><button type="submit" class="kg-wa-primary">Create group</button></form>');
}
function newCommunityModal(){
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">KINETIC GRAM / COMMUNITIES</span><h2>Create a community</h2><form id="kgWaCommunityForm"><label>Community name<input name="name" maxlength="80" required placeholder="Your community"></label><label>Description<textarea name="description" maxlength="500" placeholder="What brings this community together?"></textarea></label><button type="submit" class="kg-wa-primary">Create community</button></form>');
}
async function communityInfo(id){
 const c=state.communities.find(x=>String(x.id)===String(id));if(!c)return;
 const chat=state.conversations.find(x=>x.community_id===id&&x.kind==='community');
 const groups=state.conversations.filter(x=>x.community_id===id&&x.kind==='group');
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">COMMUNITY</span><h2>'+esc(c.name)+'</h2><p>'+esc(c.description||'')+'</p><p class="kg-wa-muted">'+esc(c.member_count)+' members</p>'+(chat?'<button class="kg-wa-community-link" type="button" data-kg-open="'+esc(chat.id)+'">Open announcements</button>':'')+'<h3>Groups</h3>'+(groups.map(g=>'<button class="kg-wa-community-link" type="button" data-kg-open="'+esc(g.id)+'">'+esc(g.title)+'</button>').join('')||'<p class="kg-wa-muted">No groups created yet.</p>')+(c.is_member?'<form id="kgWaCommunityGroupForm" data-community-id="'+esc(id)+'"><label>Create a group<input name="title" required maxlength="80" placeholder="Group name"></label><button class="kg-wa-primary">Add group</button></form>':'<button type="button" class="kg-wa-primary" data-kg-join-community="'+esc(id)+'">Join community</button>'));
}
function rowMenu(id){
 const c=state.conversations.find(x=>String(x.id)===String(id));if(!c)return;
 const mine=c.membership||{};
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">CHAT OPTIONS</span><h2>'+esc(c.kind==='direct'?directTitle(c):c.title||'Group')+'</h2>'+
 '<button type="button" class="kg-wa-option" data-kg-pin="'+esc(id)+'">'+(mine.pinned_at?'Unpin chat':'Pin chat')+'</button>'+
 '<button type="button" class="kg-wa-option" data-kg-archive="'+esc(id)+'">'+(mine.archived_at?'Unarchive chat':'Archive chat')+'</button>'+
 '<button type="button" class="kg-wa-option" data-kg-mute="'+esc(id)+'">Mute notifications for 8 hours</button>'+
 (c.kind!=='direct'?'<button type="button" class="kg-wa-option" data-kg-group-info="'+esc(id)+'">Group information</button>':'')+'<button type="button" class="kg-wa-option kg-wa-option-danger" data-kg-delete-chat="'+esc(id)+'">Remove from my chats</button>'+
 '</div>');
}
function groupInfo(id){
 const c=state.conversations.find(x=>String(x.id)===String(id));if(!c)return;
 const people=memberFor(c);
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">GROUP INFORMATION</span><h2>'+esc(c.title||'Group')+'</h2><p>'+esc(c.description||'')+'</p><h3>'+people.length+' participants</h3>'+people.map(m=>{const p=profileById(m.user_id);return '<div class="kg-wa-person-option">'+avatar(p,p.name)+'<span><b>'+esc(p.name||'Crew member')+'</b><small>'+esc(m.role)+'</small></span>'+(m.role!=='owner'?'<button type="button" data-kg-remove-member="'+esc(m.user_id)+'" data-kg-conversation="'+esc(id)+'">Remove</button>':'')+'</div>';}).join('')+'<button type="button" class="kg-wa-option" data-kg-add-members="'+esc(id)+'">＋ Add members</button>');
}
function messageMenu(messageId){
 const m=state.messages.find(x=>String(x.id)===String(messageId));if(!m)return;
 const own=String(m.sender_id)===String(state.user.id),deleted=!!m.deleted_at;
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">MESSAGE OPTIONS</span><h2>Message</h2>'+
 '<button type="button" class="kg-wa-option" data-kg-reply="'+esc(messageId)+'">↩ Reply</button>'+
 '<button type="button" class="kg-wa-option" data-kg-react-menu="'+esc(messageId)+'">☺ React</button>'+
 '<button type="button" class="kg-wa-option" data-kg-forward="'+esc(messageId)+'">⇢ Forward</button>'+
 '<button type="button" class="kg-wa-option" data-kg-copy="'+esc(messageId)+'">▢ Copy</button>'+
 (own&&!deleted?'<button type="button" class="kg-wa-option" data-kg-edit="'+esc(messageId)+'">✎ Edit</button><button type="button" class="kg-wa-option" data-kg-delete="'+esc(messageId)+'">⌫ Delete</button>':'')+
 '</div>');
}
function forwardModal(messageId){
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">FORWARD MESSAGE</span><h2>Forward to…</h2>'+state.conversations.filter(c=>c.kind!=='community').map(c=>'<button type="button" class="kg-wa-option" data-kg-forward-to="'+esc(c.id)+'" data-kg-message-id="'+esc(messageId)+'">'+esc(c.kind==='direct'?directTitle(c):c.title)+'</button>').join(''));
}
function emojiModal(messageId){
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">REACTIONS</span><div class="kg-wa-emoji-grid">'+['❤️','😂','🔥','👏','😍','😮','😢','🙏','👍','🎉','💯','🤝','✨','😎','💃','🕺'].map(e=>'<button type="button" data-kg-react="'+esc(messageId)+'" data-kg-emoji="'+e+'">'+e+'</button>').join('')+'</div>');
}
function gifModal(){
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">GIF</span><h2>Share a GIF</h2><p class="kg-wa-muted">Paste a direct GIF URL or upload a GIF from Photos.</p><form id="kgWaGifForm"><input name="url" type="url" required placeholder="https://… .gif"><button class="kg-wa-primary">Send GIF</button></form>');
}
function chatInfo(){
 const c=activeConv();if(!c)return;
 if(c.kind==='group'){groupInfo(c.id);return;}
 const p=profileById(memberFor(c).find(m=>m.user_id!==state.user.id)?.user_id);
 modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">CONTACT</span><div class="kg-wa-contact">'+avatar(p,p.name)+'<h2>'+esc(p.name||'Crew member')+'</h2><p>@'+esc(p.username||'crew-member')+'</p><p>'+esc(p.bio||'Kinetic Crew member')+'</p></div>');
}
function notifyTyping(){
 if(!state.channel||!state.active)return;
 const now=Date.now();if(now-state.typingSent<900)return;state.typingSent=now;
 state.channel.send({type:'broadcast',event:'typing',payload:{user_id:state.user.id,name:state.profile?.name||'Crew member',typing:true}});
 clearTimeout(state.typingTimer);state.typingTimer=setTimeout(()=>state.channel?.send({type:'broadcast',event:'typing',payload:{user_id:state.user.id,typing:false}}),1700);
}
async function startVoice(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Voice recording is not supported in this browser.');
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 const rec=new MediaRecorder(stream);state.mediaRecorder=rec;state.mediaChunks=[];
 rec.ondataavailable=e=>{if(e.data?.size)state.mediaChunks.push(e.data)};
 rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(state.mediaChunks,{type:rec.mimeType||'audio/webm'});const file=new File([blob],'voice-note-'+Date.now()+'.webm',{type:blob.type});try{await uploadFiles([file]);}catch(e){notify(e.message||'Voice note failed to send.')}};
 rec.start();state.recording=true;const b=$('[data-kg-voice]');if(b){b.classList.add('recording');b.textContent='■';b.setAttribute('aria-label','Stop recording and send voice note');}
}
async function stopVoice(){if(state.mediaRecorder&&state.recording){state.recording=false;state.mediaRecorder.stop();const b=$('[data-kg-voice]');if(b){b.classList.remove('recording');b.textContent='◖';}}}
async function handleClick(e){
 const t=e.target.closest('button');if(!t)return;
 if(t.matches('[data-kg-tab]')){state.tab=t.dataset.kgTab;state.showArchived=false;$$('[data-kg-tab]').forEach(b=>b.classList.toggle('active',b===t));renderList();return;}
 if(t.matches('[data-kg-archived]')){state.showArchived=!state.showArchived;t.classList.toggle('active',state.showArchived);t.textContent=state.showArchived?'← Back to chats':'▣ Archived';renderList();return;}
 if(t.matches('[data-kg-new-menu]')){modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">NEW CONVERSATION</span><h2>Start chatting</h2><button type="button" class="kg-wa-option" data-kg-new="direct">Private chat</button><button type="button" class="kg-wa-option" data-kg-new="group">Create group</button>');return;}
 if(t.matches('[data-kg-menu]')){modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><span class="kg-wa-kicker">INBOX</span><h2>Chat settings</h2><button type="button" class="kg-wa-option" data-kg-menu-archived>Archived chats</button><button type="button" class="kg-wa-option" data-kg-new="group">Create group</button><button type="button" class="kg-wa-option" data-kg-new="direct">Start private chat</button>');return;}
 if(t.matches('[data-kg-menu-archived]')){closeModal();state.tab='chats';state.showArchived=true;renderList();return;}
 if(t.matches('[data-kg-new="direct"]')){newDirectModal();return;}
 if(t.matches('[data-kg-new="group"]')){newGroupModal();return;}
 if(t.matches('[data-kg-new-community]')){newCommunityModal();return;}
 if(t.matches('[data-kg-start-direct]')){try{const id=await call('kg_open_direct_chat',{p_other_user_id:t.dataset.kgStartDirect});closeModal();await loadData();await openConversation(id)}catch(err){notify(err.message||'Could not start private chat.')}return;}
 if(t.matches('[data-kg-modal-close]')||t.matches('[data-kg-modal-backdrop]')){closeModal();return;}
 if(t.matches('[data-kg-open]')){closeModal();const id=t.dataset.kgOpen;try{await openConversation(id)}catch(err){notify(err.message||'Could not open chat.')}return;}
 if(t.matches('[data-kg-back]')){if(state.channel)client.removeChannel(state.channel);state.channel=null;state.active=null;window.kcGramActiveConversation='';$('#kgWaThreadView').hidden=true;$('#kgWaListView').hidden=false;$('.kg-wa-fab-wrap').hidden=false;await loadData();return;}
 if(t.matches('[data-kg-community]')){await communityInfo(t.dataset.kgCommunity);return;}
 if(t.matches('[data-kg-join-community]')){try{await call('kg_join_community',{p_community_id:t.dataset.kgJoinCommunity});notify('You joined the community.');await loadData();closeModal();renderList();}catch(err){notify(err.message)}return;}
 if(t.matches('[data-kg-row-menu]')){rowMenu(t.dataset.kgRowMenu);return;}
 if(t.matches('[data-kg-pin]')||t.matches('[data-kg-archive]')||t.matches('[data-kg-mute]')){
  const id=t.dataset.kgPin||t.dataset.kgArchive||t.dataset.kgMute,c=state.conversations.find(x=>x.id===id),patch={};
  if(t.dataset.kgPin)patch.pinned_at=c.membership?.pinned_at?null:new Date().toISOString();
  if(t.dataset.kgArchive)patch.archived_at=c.membership?.archived_at?null:new Date().toISOString();
  if(t.dataset.kgMute)patch.muted_until=new Date(Date.now()+8*3600e3).toISOString();
  const r=await client.from('kg_conversation_members').update(patch).eq('conversation_id',id).eq('user_id',state.user.id);
  if(r.error)notify(r.error.message);else{closeModal();await loadData();}return;
 }
 if(t.matches('[data-kg-chat-info]')){chatInfo();return;}
 if(t.matches('[data-kg-chat-menu]')){rowMenu(state.active);return;}
 if(t.matches('[data-kg-chat-search]')){$('#kgWaMessageSearch').hidden=false;$('#kgWaMessageQuery')?.focus();return;}
 if(t.matches('[data-kg-close-message-search]')){$('#kgWaMessageSearch').hidden=true;$('#kgWaMessageQuery').value='';$$('.kg-wa-message').forEach(x=>x.hidden=false);return;}
 if(t.matches('[data-kg-attach]')){$('#kgWaAttachSheet').hidden=!$('#kgWaAttachSheet').hidden;return;}
 if(t.matches('[data-kg-file-kind]')){$('#kgWaAttachSheet').hidden=true;const kind=t.dataset.kgFileKind,input=$('#kgWaFileInput');input.accept=kind==='image'?'image/*':kind==='video'?'video/*':kind==='audio'?'audio/*':'.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip';input.click();return;}
 if(t.matches('[data-kg-gif]')){gifModal();return;}
 if(t.matches('[data-kg-location]')){if(!navigator.geolocation){notify('Location is unavailable.');return;}navigator.geolocation.getCurrentPosition(pos=>sendText('https://maps.google.com/?q='+pos.coords.latitude+','+pos.coords.longitude,'location').catch(err=>notify(err.message)),()=>notify('Location permission was not granted.'));return;}
 if(t.matches('[data-kg-emoji]')){const input=$('#kgWaText');if(input)input.value+=' 😊';input?.focus();return;}
 if(t.matches('[data-kg-voice]')){try{state.recording?await stopVoice():await startVoice();}catch(err){notify(err.message)}return;}
 if(t.matches('[data-kg-cancel-reply]')){state.reply=null;renderThread();return;}
 if(t.matches('[data-kg-reply]')){const m=state.messages.find(x=>x.id===t.dataset.kgReply);if(m){state.reply={...m,sender_name:profileById(m.sender_id).name};renderThread();$('#kgWaText')?.focus()}return;}
 if(t.matches('[data-kg-copy]')){const m=state.messages.find(x=>String(x.id)===String(t.dataset.kgCopy));if(m){const text=m.body||'';if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>notify('Message copied.')).catch(()=>notify('Could not copy message.'));else notify('Clipboard is unavailable in this browser.');}closeModal();return;}
 if(t.matches('[data-kg-forward]')){forwardModal(t.dataset.kgForward);return;}
 if(t.matches('[data-kg-forward-to]')){const m=state.messages.find(x=>x.id===t.dataset.kgMessageId);try{const forwardedId=await call('kg_send_message',{p_conversation_id:t.dataset.kgForwardTo,p_body:m?.body||'',p_message_type:m?.message_type||'text',p_forwarded_from_id:m?.id||null});void sendMessagePush(forwardedId,t.dataset.kgForwardTo);closeModal();notify('Message forwarded.');await loadData();}catch(err){notify(err.message)}return;}
 if(t.matches('[data-kg-react-menu]')){emojiModal(t.dataset.kgReactMenu);return;}
 if(t.matches('[data-kg-react]')){try{await call('kg_set_message_reaction',{p_message_id:t.dataset.kgReact,p_emoji:t.dataset.kgEmoji});closeModal();await loadMessages(state.active);}catch(err){notify(err.message)}return;}
 if(t.matches('[data-kg-edit]')){const m=state.messages.find(x=>x.id===t.dataset.kgEdit),body=prompt('Edit message',m?.body||'');if(body!==null){try{await call('kg_edit_message',{p_message_id:m.id,p_body:body});await loadMessages(state.active)}catch(err){notify(err.message)}}return;}
 if(t.matches('[data-kg-delete]')){if(confirm('Delete this message for everyone?')){try{await call('kg_delete_message',{p_message_id:t.dataset.kgDelete});await loadMessages(state.active)}catch(err){notify(err.message)}}return;}
 if(t.matches('[data-kg-delete-chat]')){const id=t.dataset.kgDeleteChat;if(!confirm('Remove this conversation from your chats? Other members will keep their messages.'))return;try{await call('kg_delete_conversation_for_self',{p_conversation_id:id});if(String(state.active)===String(id)){if(state.channel)client.removeChannel(state.channel);state.channel=null;state.active=null;window.kcGramActiveConversation='';$('#kgWaThreadView').hidden=true;$('#kgWaListView').hidden=false;$('.kg-wa-fab-wrap').hidden=false;}closeModal();await loadData();renderList();notify('Conversation removed from your chats.');}catch(err){notify(err.message||'Could not remove this conversation.');}return;}
 if(t.matches('[data-kg-group-info]')){groupInfo(t.dataset.kgGroupInfo);return;}
 if(t.matches('[data-kg-remove-member]')){try{await call('kg_remove_conversation_member',{p_conversation_id:t.dataset.kgConversation,p_user_id:t.dataset.kgRemoveMember});await loadData();groupInfo(t.dataset.kgConversation)}catch(err){notify(err.message)}return;}
 if(t.matches('[data-kg-add-members]')){const id=t.dataset.kgAddMembers;modal('<button type="button" class="kg-wa-modal-close" data-kg-modal-close>×</button><h2>Add group members</h2><div class="kg-wa-person-list">'+memberPicker()+'</div><button type="button" class="kg-wa-primary" data-kg-add-selected="'+esc(id)+'">Add selected</button>');return;}
 if(t.matches('[data-kg-add-selected]')){const id=t.dataset.kgAddSelected,selected=$$('input[name="member"]:checked',$('#kgWaModalRoot')).map(x=>x.value);try{for(const member of selected)await call('kg_add_conversation_member',{p_conversation_id:id,p_user_id:member,p_role:'member'});closeModal();await loadData();groupInfo(id)}catch(err){notify(err.message)}return;}
}
// WhatsApp-style message gestures: long press opens contextual actions; swipe right replies.
let kgPressTimer=null,kgPressTarget=null,kgPointerStart=null,kgGestureConsumed=false;
document.addEventListener('pointerdown',e=>{
 const msg=e.target.closest('#kgWaMessages [data-kg-message]');if(!msg||e.target.closest('a,button,input,video,audio'))return;
 kgGestureConsumed=false;kgPressTarget=msg;kgPointerStart={x:e.clientX,y:e.clientY,id:msg.dataset.kgMessage};
 clearTimeout(kgPressTimer);
 kgPressTimer=setTimeout(()=>{kgGestureConsumed=true;kgPressTarget?.classList.add('kg-wa-message-selected');messageMenu(kgPointerStart?.id);},520);
},{passive:true});
document.addEventListener('pointermove',e=>{
 if(!kgPointerStart)return;
 if(Math.abs(e.clientX-kgPointerStart.x)>12||Math.abs(e.clientY-kgPointerStart.y)>14)clearTimeout(kgPressTimer);
},{passive:true});
document.addEventListener('pointerup',e=>{
 clearTimeout(kgPressTimer);
 if(!kgPointerStart)return;
 const dx=e.clientX-kgPointerStart.x,dy=e.clientY-kgPointerStart.y,id=kgPointerStart.id;
 if(!kgGestureConsumed&&dx>58&&Math.abs(dy)<42){
  const m=state.messages.find(x=>String(x.id)===String(id));
  if(m){state.reply={...m,sender_name:profileById(m.sender_id).name};renderThread();$('#kgWaText')?.focus();}
 }
 kgPointerStart=null;kgPressTarget=null;
},{passive:true});
document.addEventListener('pointercancel',()=>{clearTimeout(kgPressTimer);kgPointerStart=null;kgPressTarget=null;},{passive:true});
document.addEventListener('contextmenu',e=>{
 const msg=e.target.closest('#kgWaMessages [data-kg-message]');if(!msg)return;
 e.preventDefault();clearTimeout(kgPressTimer);kgGestureConsumed=true;messageMenu(msg.dataset.kgMessage);
});
document.addEventListener('click',e=>{if(e.target.closest('#kgWaApp'))handleClick(e).catch(err=>notify(err.message||'Chat action failed.'))});
document.addEventListener('submit',async e=>{
 const f=e.target;
 if(f.id==='kgWaComposer'){e.preventDefault();const body=String(new FormData(f).get('body')||'').trim();if(!body)return;const b=$('.kg-wa-send',f);b.disabled=true;try{await sendText(body,'text',state.reply?.id||null)}catch(err){notify(err.message||'Message not sent.')}finally{b.disabled=false}return;}
 if(f.id==='kgWaGroupForm'){e.preventDefault();const d=new FormData(f),members=$('input[name="member"]:checked',f).map(x=>x.value);if(!members.length){notify('Select at least one crew member for this group.');return;}const submit=f.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Creating…';}try{const id=await call('kg_create_group_chat',{p_title:String(d.get('title')).trim(),p_description:String(d.get('description')||''),p_member_ids:members});closeModal();await loadData();state.tab='groups';renderList();await openConversation(id);notify('Group created.');}catch(err){notify(err.message||'Could not create group.');if(submit){submit.disabled=false;submit.textContent='Create group';}}return;}
 if(f.id==='kgWaCommunityForm'){e.preventDefault();const d=new FormData(f);try{await call('kg_create_community',{p_name:String(d.get('name')).trim(),p_description:String(d.get('description')||'')});closeModal();await loadData();state.tab='communities';renderList();notify('Community created.')}catch(err){notify(err.message)}return;}
 if(f.id==='kgWaCommunityGroupForm'){e.preventDefault();const id=f.dataset.communityId,title=new FormData(f).get('title');try{const chat=await call('kg_create_community_group',{p_community_id:id,p_title:String(title).trim(),p_member_ids:[]});closeModal();await loadData();await openConversation(chat)}catch(err){notify(err.message)}return;}
 if(f.id==='kgWaGifForm'){e.preventDefault();const url=String(new FormData(f).get('url')||'').trim();if(!/^https:\/\/\S+\.gif(?:\?\S*)?$/i.test(url)){notify('Enter a direct HTTPS .gif URL.');return;}try{await sendText(url,'gif',state.reply?.id||null)}catch(err){notify(err.message)}return;}
});
document.addEventListener('input',e=>{
 if(e.target.id==='kgWaSearch'){state.search=e.target.value;const b=$('[data-kg-search-clear]');if(b)b.hidden=!state.search;renderList();}
 if(e.target.id==='kgWaPeopleSearch'){const q=e.target.value.toLowerCase();$$('.kg-wa-person-option',$('#kgWaPeopleList')).forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q));}
 if(e.target.id==='kgWaMessageQuery'){const q=e.target.value.toLowerCase();$$('.kg-wa-message').forEach(x=>x.hidden=!x.textContent.toLowerCase().includes(q));}
 if(e.target.id==='kgWaText'&&e.target.value)notifyTyping();
});
document.addEventListener('change',async e=>{
 if(e.target.id==='kgWaFileInput'&&e.target.files?.length){try{await uploadFiles([...e.target.files]);notify('Media sent.')}catch(err){notify(err.message||'Upload failed.')}finally{e.target.value='';}}
});
document.addEventListener('click',e=>{if(e.target.matches('[data-kg-search-clear]')){state.search='';$('#kgWaSearch').value='';e.target.hidden=true;renderList();}});

window.addEventListener('kc:kg-message',event=>{
 const detail=event.detail||{},conversationId=String(detail.conversationId||'');
 if(!conversationId||!$('#kgWaApp'))return;
 if(state.active&&String(state.active)===conversationId){
  loadMessages(conversationId).then(()=>renderThread()).catch(error=>console.warn('Live conversation refresh failed:',error));
 }else{
  loadData().catch(error=>console.warn('Live inbox refresh failed:',error));
 }
});
const observer=new MutationObserver(()=>{const root=$('#kgWaApp');if(root&&!root.dataset.kgInit){root.dataset.kgInit='1';loadData().catch(err=>{const list=$('#kgWaList');if(list)list.innerHTML='<div class="kg-wa-empty"><b>Could not load Kinetic Gram chats</b><small>'+esc(err.message||'Please retry.')+'</small><button type="button" data-kg-retry>Retry</button></div>'});}else if(!root){if(state.channel){client.removeChannel(state.channel);state.channel=null;}state.active=null;window.kcGramActiveConversation='';}});
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{if($('#kgWaApp')&&e.target.closest('[data-kg-retry]'))loadData().catch(err=>notify(err.message))});
})();
