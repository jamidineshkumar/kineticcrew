/* Kinetic Crew profile morph: animate the real tapped control, then navigate. */
(()=>{'use strict';
let running=false;
function morphAndNavigate(trigger){
 if(running)return;
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){trigger.click();return;}
 running=true;
 const rect=trigger.getBoundingClientRect();
 const overlay=document.createElement('div');overlay.className='kc-liquid-transition';overlay.setAttribute('aria-hidden','true');
 const wash=document.createElement('div');wash.className='kc-liquid-transition-wash';
 const card=document.createElement('div');card.className='kc-liquid-transition-card';
 card.innerHTML='<span>KINETIC CREW</span><b>YOUR PROFILE</b>';
 Object.assign(card.style,{left:rect.left+'px',top:rect.top+'px',width:Math.max(42,rect.width)+'px',height:Math.max(42,rect.height)+'px',borderRadius:getComputedStyle(trigger).borderRadius||'50%'});
 overlay.append(wash,card);document.body.appendChild(overlay);
 const width=Math.min(innerWidth-24,620),height=Math.min(innerHeight-28,560),left=(innerWidth-width)/2,top=(innerHeight-height)/2;
 const fade=wash.animate([{opacity:0},{opacity:.58,offset:.28},{opacity:.58,offset:.7},{opacity:0}],{duration:760,easing:'cubic-bezier(.22,.72,.18,1)',fill:'forwards'});
 const morph=card.animate([
  {left:rect.left+'px',top:rect.top+'px',width:Math.max(42,rect.width)+'px',height:Math.max(42,rect.height)+'px',borderRadius:getComputedStyle(trigger).borderRadius||'50%',transform:'scale(.96)'},
  {left:left+'px',top:top+'px',width:width+'px',height:height+'px',borderRadius:'28px',transform:'scale(1.015)',offset:.78},
  {left:left+'px',top:top+'px',width:width+'px',height:height+'px',borderRadius:'28px',transform:'scale(1)'}
 ],{duration:760,easing:'cubic-bezier(.2,.78,.18,1)',fill:'forwards'});
 Promise.all([fade.finished,morph.finished]).catch(()=>{}).finally(()=>{
  overlay.remove();running=false;
  trigger.dataset.kcMorphBypass='1';trigger.click();delete trigger.dataset.kcMorphBypass;
 });
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-view="profile"],.kc-header-profile,[data-profile-open]');
 if(!trigger||trigger.dataset.kcMorphBypass==='1'||document.body.classList.contains('kc-profile-view-open'))return;
 event.preventDefault();event.stopImmediatePropagation();morphAndNavigate(trigger);
},true);
const app=document.getElementById('app');
if(app)new MutationObserver(()=>document.body.classList.toggle('kc-profile-view-open',!!app.querySelector('.kc-liquid-profile'))).observe(app,{childList:true,subtree:true});
})();