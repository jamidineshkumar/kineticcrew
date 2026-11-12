/* Kinetic Crew signature transition: center-origin RGB halftone bloom. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('aria-hidden','true');
overlay.innerHTML='<canvas class="kc-transition-canvas"></canvas>';
document.body.appendChild(overlay);
const canvas=overlay.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:false});
let raf=0,closed=false,w=0,h=0,dpr=1,started=0,last=0,appReady=!!app?.children.length;
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const BLACK='#03030a';
function resize(){
 dpr=Math.min(window.devicePixelRatio||1,1.5);w=innerWidth;h=innerHeight;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 canvas.style.width=w+'px';canvas.style.height=h+'px';
 ctx.setTransform(dpr,0,0,dpr,0,0);
}
function color(t){
 const stops=[[0,[0,205,242]],[.19,[0,112,255]],[.38,[116,40,255]],[.58,[222,20,211]],[.77,[255,44,111]],[.94,[255,116,25]],[1,[255,178,35]]];
 for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){
  const a=stops[i-1],b=stops[i],q=(t-a[0])/(b[0]-a[0]);
  return a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*q));
 }
 return stops[stops.length-1][1];
}
function easeOutCubic(t){return 1-Math.pow(1-t,3);}
function draw(now){
 if(closed)return;
 if(!started)started=now;
 const elapsed=now-started;
 ctx.fillStyle=BLACK;ctx.fillRect(0,0,w,h);
 // Keep the first frames entirely black, then bloom from the central dark core.
 const delay=260,duration=1900;
 const raw=Math.max(0,Math.min(1,(elapsed-delay)/duration));
 if(raw>0){
  const bloom=easeOutCubic(raw);
  const maxScale=Math.hypot(w,h)*.66;
  const scale=Math.max(0.001,maxScale*(.012+.988*bloom));
  const step=Math.max(6.5,Math.min(10.5,w/82));
  const rot=elapsed*.000035;
  for(let y=-1.3;y<=1.3;y+=step/scale){
   for(let x=-1.3;x<=1.3;x+=step/scale){
    const xx=x*Math.cos(rot)-y*Math.sin(rot),yy=x*Math.sin(rot)+y*Math.cos(rot);
    const rr=Math.hypot(xx,yy),ang=Math.atan2(yy,xx);
    const wave=Math.sin(ang*2.1+rr*5.4+elapsed*.0011)*.075+Math.sin(ang*3.2-rr*3.1-elapsed*.0008)*.035;
    const ring=rr+wave;
    if(ring<.245||ring>1.08)continue;
    const edge=Math.min((ring-.245)/.13,(1.08-ring)/.16,1);
    const depth=.72+.28*Math.cos(ang*2+rr*2.6+elapsed*.0007);
    const perspective=1+.16*Math.sin(ang*2.4+elapsed*.0005+rr*3);
    const px=w*.5+xx*scale*perspective;
    const py=h*.5+yy*scale*.94*perspective;
    const t=((ang+Math.PI)/(Math.PI*2)+.08+rr*.12)%1;
    const rgb=color(t);
    const size=(1.05+Math.pow(Math.max(0,1-Math.abs(ring-.68)/.42),1.7)*2.35)*depth*Math.max(.12,edge);
    const alpha=Math.min(.98,edge*(.5+.5*depth)*Math.min(1,bloom*2.8));
    ctx.beginPath();
    ctx.fillStyle='rgba('+rgb.join(',')+','+alpha+')';
    ctx.shadowColor='rgba('+rgb.join(',')+','+(alpha*.55)+')';
    ctx.shadowBlur=size*2.2;
    ctx.ellipse(px,py,size*perspective,size*1.14,0,0,Math.PI*2);
    ctx.fill();
   }
  }
  ctx.shadowBlur=0;
 }
 if(elapsed<delay+duration)raf=requestAnimationFrame(draw);
 else finishBloom();
}
let bloomFinished=false;
function finishBloom(){
 if(bloomFinished||closed)return;
 bloomFinished=true;
 // Hold the fully expanded pattern briefly; wait for the app to be ready too.
 const waitForReady=()=>{if(appReady||performance.now()-started>4700)dismiss();else setTimeout(waitForReady,80);};
 setTimeout(waitForReady,260);
}
function dismiss(){
 if(closed)return;closed=true;cancelAnimationFrame(raf);
 if(app){app.classList.remove('kc-page-enter');void app.offsetWidth;app.classList.add('kc-page-enter');}
 overlay.classList.add('is-leaving');
 setTimeout(()=>overlay.remove(),700);
}
resize();addEventListener('resize',resize,{passive:true});
if(reduced){ctx.fillStyle=BLACK;ctx.fillRect(0,0,w,h);dismiss();}
else raf=requestAnimationFrame(draw);
const observer=app?new MutationObserver(()=>{if(app.children.length){appReady=true;observer.disconnect();}}):null;
if(observer)observer.observe(app,{childList:true,subtree:true});
setTimeout(()=>{appReady=true;if(bloomFinished)dismiss();},4900);
const revealImages=root=>{
 (root||document).querySelectorAll?.('img').forEach(img=>{
  if(img.complete&&img.naturalWidth){img.classList.add('kc-image-reveal');return;}
  if(!img.dataset.kcRevealBound){img.dataset.kcRevealBound='1';img.addEventListener('load',()=>img.classList.add('kc-image-reveal'),{once:true});}
 });
};
revealImages(document);
if(app)new MutationObserver(()=>revealImages(app)).observe(app,{childList:true,subtree:true});
})();