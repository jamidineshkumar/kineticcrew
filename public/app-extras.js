(()=>{'use strict';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let chatTimer=null, chatBusy=false, chatLast='';
const client=()=>window.kcSupabase;
function notify(t){const el=$('#toast');if(el){el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}}
function userId(){return client()?.auth?.getUser?.()}
function navEnhance(){const nav=$('#nav');if(!nav||nav.querySelector('[data-kc-settings]'))return;const b=document.createElement('button');b.className='navitem';b.dataset.kcSettings='1';b.innerHTML='<span class="nicon">⚙</span><span>App settings</span>';nav.append(b);}
function addReveal(){document.querySelectorAll('#app .surface,#app .stat,#app .event,#app .announcement,#app .sectionhead').forEach(el=>{if(el.dataset.kcReveal)return;el.dataset.kcReveal='1';el.classList.add('kc-reveal');requestAnimationFrame(()=>el.classList.add('kc-visible'));});}
function updateBadge(){const dot=$('#updateDot');if(dot){dot.style.display='block';dot.style.opacity='1';}const button=$('#updatesTop');if(button)button.title='Notifications';}
function renderSettings(){
 clearInterval(chatTimer);$('#crumb').textContent='App settings';
 const theme=document.documentElement.dataset.theme||'dark';
 $('#app').innerHTML='<div class="welcome"><div><div class="eyebrow">YOUR SPACE / PREFERENCES</div><h1>App settings</h1><p>Make Kinetic Crew feel like yours.</p></div></div><div class="surface" style="padding:22px"><div class="kc-settings-grid"><div class="kc-setting"><b>Appearance</b><p>Choose a visual style for the app.</p><button class="outline" id="kcTheme">'+(theme==='light'?'Switch to dark':'Switch to light')+' mode</button></div><div class="kc-setting"><b>Motion effects</b><p>Turn scroll reveals and interface movement on or off.</p><button class="outline" id="kcMotion">Toggle motion</button></div><div class="kc-setting"><b>Notifications</b><p>Manage crew announcements and device alerts.</p><button class="outline" id="kcNotifications">Open notifications</button></div><div class="kc-setting"><b>Account & profile</b><p>Update your name and profile picture.</p><button class="outline" id="kcProfile">Open my profile</button></div><div class="kc-setting"><b>Install app</b><p>Add Kinetic Crew to your phone home screen.</p><button class="outline" id="kcInstall">Install Kinetic Crew</button></div><div class="kc-setting"><b>About</b><p>Kinetic Crew · Dance, community and movement.</p><small>Made to move together.</small></div></div></div><nav class="mobile-bottom-nav"><button data-kc-home>⌂<small>Home</small></button><button data-kc-events>▦<small>Events</small></button><button data-kc-notifications>♧<small>Alerts</small></button><button data-kc-profile>◉<small>Profile</small></button></nav>';
}
function renderChat(messages){
 const me=window.kcCurrentUserId||'';
 const feed=$('#kcChatFeed');if(!feed)return;
 const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<90;
 feed.innerHTML=messages.map(m=>'<div class="kc-bubble '+(m.sender_id===me?'mine':'')+'"><small>'+esc(m.sender_name||'Crew member')+'</small>'+esc(m.body)+'<time>'+new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</time></div>').join('')||'<div style="margin:auto;text-align:center;color:var(--muted)">No messages yet. Say hello to the crew 👋</div>';
 if(nearBottom)feed.scrollTop=feed.scrollHeight;
}
async function loadChat(){
 if(chatBusy||!$('#kcChatFeed'))return;chatBusy=true;
 try{const {data,error}=await client().rpc('crew_chat',{p_action:'list',p_body:null,p_before:null});if(error)throw error;renderChat((data||[]).slice().reverse());}
 catch(e){const f=$('#kcChatFeed');if(f)f.innerHTML='<p style="color:var(--muted)">Chat is not ready yet. Apply the latest Supabase migration, then reopen this page.</p>';console.warn(e);}
 finally{chatBusy=false;}
}
function renderChatPage(){
 clearInterval(chatTimer);$('#crumb').textContent='Crew chat';
 $('#app').innerHTML='<div class="welcome"><div><div class="eyebrow">KINETIC CREW / COMMUNITY</div><h1>Crew chat</h1><p>One shared conversation for the whole crew. Keep the energy moving.</p></div></div><section class="kc-chat"><div class="kc-chat-head"><div class="avatar">KC</div><div><b>Kinetic Crew</b><small style="display:block;color:var(--muted)">Crew group · Members and admins</small></div><span style="margin-left:auto;color:var(--muted);font-size:11px">● LIVE</span></div><div id="kcChatFeed" class="kc-chat-feed"></div><form id="kcChatForm" class="kc-chat-compose"><input name="message" maxlength="2000" autocomplete="off" placeholder="Message the crew…" required><button aria-label="Send message">➤</button></form></section><nav class="mobile-bottom-nav"><button data-kc-home>⌂<small>Home</small></button><button data-kc-events>▦<small>Events</small></button><button data-kc-notifications>♧<small>Alerts</small></button><button data-kc-profile>◉<small>Profile</small></button></nav>';
 loadChat();chatTimer=setInterval(loadChat,5000);
}
async function renderProfilePhoto(){
 const app=$('#app');if(!app)return;
 const form=$('#profileForm');if(!form||form.querySelector('#kcAvatarFile'))return;
 let uid='';try{const {data}=await client().auth.getUser();uid=data.user?.id||'';}catch{}
 const {data:sessionData}=await client().auth.getSession();const meta=sessionData?.session?.user?.user_metadata||{};
 const current=meta.avatar_url||'';
 const wrap=document.createElement('div');wrap.className='kc-profile-photo';wrap.innerHTML='<img class="kc-avatar-preview" id="kcAvatarPreview" src="'+esc(current)+'" alt="Profile photo"><div><b>Profile picture</b><p style="color:var(--muted);font-size:12px">JPG, PNG or WebP · up to 5 MB</p><label class="outline" style="display:inline-flex;align-items:center;padding:10px 16px;cursor:pointer">Choose photo<input id="kcAvatarFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>';
 form.prepend(wrap);
 $('#kcAvatarFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;if(file.size>5*1024*1024){notify('Choose an image smaller than 5 MB.');return;}
  try{const {data:session}=await client().auth.getSession();const id=session.session.user.id;const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=id+'/avatar.'+ext;
   const {error:upErr}=await client().storage.from('crew-avatars').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'3600'});if(upErr)throw upErr;
   const {data:urlData}=client().storage.from('crew-avatars').getPublicUrl(path);
   const {error:saveErr}=await client().rpc('crew_update_avatar',{p_avatar_url:urlData.publicUrl});if(saveErr)throw saveErr;
   $('#kcAvatarPreview').src=urlData.publicUrl;notify('Profile picture updated. Reload the app to refresh your crew avatar.');
  }catch(err){notify(err.message||'Could not upload profile picture. Apply the avatar migration first.');}
 });
}
document.addEventListener('click',e=>{
 const set=e.target.closest('[data-kc-settings]');if(set){e.preventDefault();e.stopImmediatePropagation();renderSettings();return;}
 const chat=e.target.closest('#nav [data-view="chat"]');if(chat){e.preventDefault();e.stopImmediatePropagation();renderChatPage();return;}
 const theme=e.target.closest('#kcTheme');if(theme){const next=document.documentElement.dataset.theme==='light'?'dark':'light';if(window.kcTheme?.set)window.kcTheme.set(next);else{document.documentElement.dataset.theme=next;localStorage.setItem('kc-theme',next);}renderSettings();return;}
 if(e.target.closest('#kcMotion')){const off=localStorage.getItem('kc-motion')==='off';localStorage.setItem('kc-motion',off?'on':'off');document.documentElement.classList.toggle('kc-motion-off',!off);notify(off?'Motion enabled':'Motion reduced');return;}
 if(e.target.closest('#kcNotifications')){document.querySelector('#nav [data-view="notifications"]')?.click();return;}
 if(e.target.closest('#kcProfile')){document.querySelector('#nav [data-view="profile"]')?.click();return;}
 if(e.target.closest('#kcInstall')){$('#installApp')?.click();return;}
 if(e.target.closest('[data-kc-home]')){document.querySelector('#nav [data-view="overview"]')?.click();return;}
 if(e.target.closest('[data-kc-events]')){document.querySelector('#nav [data-view="events"]')?.click();return;}
 if(e.target.closest('[data-kc-notifications]')){document.querySelector('#nav [data-view="notifications"]')?.click();return;}
 if(e.target.closest('[data-kc-profile]')){document.querySelector('#nav [data-view="profile"]')?.click();return;}
});
document.addEventListener('submit',async e=>{
 if(e.target.id!=='kcChatForm')return;e.preventDefault();const input=e.target.elements.message;const body=input.value.trim();if(!body)return;
 try{const {error}=await client().rpc('crew_chat',{p_action:'send',p_body:body,p_before:null});if(error)throw error;input.value='';await loadChat();}
 catch(err){notify(err.message||'Chat send failed. Apply the chat migration first.');}
});
const mo=new MutationObserver(()=>{navEnhance();addReveal();if($('#profileForm'))renderProfilePhoto();});
mo.observe(document.body,{childList:true,subtree:true});
window.addEventListener('beforeunload',()=>clearInterval(chatTimer));
})();
