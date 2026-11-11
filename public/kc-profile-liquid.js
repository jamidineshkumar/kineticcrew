/* Sub-second shared-card liquid transition into the profile view. */
(()=>{'use strict';
let running=false;
function startProfileMorph(source){
 if(running||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 running=true;
 const rect=source?.getBoundingClientRect?.()||{left:innerWidth-70,top:16,width:48,height:48};
 const overlay=document.createElement('div');overlay.className='kc-liquid-transition';overlay.setAttribute('aria-hidden','true');
 const wash=document.createElement('div');wash.className='kc-liquid-transition-wash';
 const card=document.createElement('div');card.className='kc-liquid-transition-card';
 card.innerHTML='<span>KINETIC CREW</span><b>YOUR PROFILE</b>';
 Object.assign(card.style,{left:rect.left+'px',top:rect.top+'px',width:Math.max(38,rect.width)+'px',height:Math.max(38,rect.height)+'px',borderRadius:'50%'});
 overlay.append(wash,card);document.body.appendChild(overlay);
 const targetW=Math.min(innerWidth-28,620),targetH=Math.min(innerHeight-40,560);
 const targetL=(innerWidth-targetW)/2,targetT=(innerHeight-targetH)/2;
 const washAnim=wash.animate([{opacity:0},{opacity:1,offset:.22},{opacity:1,offset:.78},{opacity:0}],{duration:820,easing:'cubic-bezier(.22,.78,.18,1)',fill:'forwards'});
 const cardAnim=card.animate([
  {left:rect.left+'px',top:rect.top+'px',width:Math.max(38,rect.width)+'px',height:Math.max(38,rect.height)+'px',borderRadius:'50%',filter:'blur(0px)',transform:'rotate(-7deg) scale(.92)'},
  {left:targetL+'px',top:targetT+'px',width:targetW+'px',height:targetH+'px',borderRadius:'30px',filter:'blur(0px)',transform:'rotate(1deg) scale(1.025)',offset:.72},
  {left:targetL+'px',top:targetT+'px',width:targetW+'px',height:targetH+'px',borderRadius:'30px',filter:'blur(0px)',transform:'rotate(0) scale(1)'}
 ],{duration:820,easing:'cubic-bezier(.2,.78,.18,1)',fill:'forwards'});
 overlay.animate([{backdropFilter:'blur(0px)'},{backdropFilter:'blur(13px)'},{backdropFilter:'blur(0px)'}],{duration:820,easing:'ease-out'});
 Promise.all([washAnim.finished,cardAnim.finished]).catch(()=>{}).finally(()=>{overlay.remove();running=false;});
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-view="profile"],.kc-header-profile,[data-profile-open]');
 if(!trigger||document.body.classList.contains('kc-profile-view-open'))return;
 startProfileMorph(trigger);
},true);
const app=document.getElementById('app');
if(app)new MutationObserver(()=>document.body.classList.toggle('kc-profile-view-open',!!app.querySelector('.kc-liquid-profile'))).observe(app,{childList:true,subtree:true});
})();