/* Kinetic Crew signature transition: animated RGB halftone vortex. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';
overlay.setAttribute('aria-hidden','true');
overlay.innerHTML='<canvas class="kc-transition-canvas"></canvas>';
document.body.appendChild(overlay);
const canvas=overlay.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:false});
let raf=0,closed=false,phase=0,start=performance.now(),last=0;
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let w=0,h=0,dpr=1;
function resize(){dpr=Math.min(window.devicePixelRatio||1,1.5);w=innerWidth;h=innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
function color(t){
 const stops=[[0,[0,205,242]],[.19,[0,112,255]],[.38,[116,40,255]],[.58,[222,20,211]],[.77,[255,44,111]],[.94,[255,116,25]],[1,[255,178,35]]];
 for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const a=stops[i-1],b=stops[i],q=(t-a[0])/(b[0]-a[0]);return a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*q));}
 return stops[stops.length-1][1];
}
function draw(now){
 if(closed)return;
 const elapsed=now-start,dt=Math.min(40,now-last||16);last=now;phase+=dt*.00022;
 ctx.fillStyle='#050518';ctx.fillRect(0,0,w,h);
 const cx=w*.49,cy=h*.49,scale=Math.min(w*.51,h*.39);
 const step=Math.max(7,Math.min(11,w/78));
 const rot=phase*.16;
 for(let y=-1.35;y<=1.35;y+=step/scale){
  for(let x=-1.35;x<=1.35;x+=step/scale){
   const xx=x*Math.cos(rot)-y*Math.sin(rot),yy=x*Math.sin(rot)+y*Math.cos(rot);
   const rr=Math.hypot(xx,yy),ang=Math.atan2(yy,xx);
   const wave=Math.sin(ang*2.1+rr*5.4+phase*2)*.075+Math.sin(ang*3.2-rr*3.1-phase)*.035;
   const ring=rr+wave;
   if(ring<.26||ring>1.08)continue;
   const edge=Math.min((ring-.26)/.13,(1.08-ring)/.16,1);
   const depth=.72+.28*Math.cos(ang*2+rr*2.6+phase);
   const perspective=1+.16*Math.sin(ang*2.4+phase+rr*3);
   const px=cx+xx*scale*perspective;
   const py=cy+yy*scale*.94*perspective;
   const t=((ang+Math.PI)/(Math.PI*2)+.08+rr*.12)%1;
   const rgb=color(t);
   const size=(1.05+Math.pow(Math.max(0,1-Math.abs(ring-.68)/.42),1.7)*2.35)*depth*Math.max(.12,edge);
   const alpha=Math.min(.98,edge*(.5+.5*depth));
   ctx.beginPath();ctx.fillStyle='rgba('+rgb.join(',')+','+alpha+')';ctx.shadowColor='rgba('+rgb.join(',')+','+(alpha*.55)+')';ctx.shadowBlur=size*2.4;ctx.ellipse(px,py,size*perspective,size*1.14,0,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.shadowBlur=0;
 if(elapsed>(reduced?250:1700))dismiss();
 else raf=requestAnimationFrame(draw);
}
function dismiss(){if(closed)return;closed=true;cancelAnimationFrame(raf);overlay.classList.add('is-leaving');setTimeout(()=>overlay.remove(),520);}
resize();addEventListener('resize',resize,{passive:true});
if(reduced){draw(performance.now());dismiss();}
else raf=requestAnimationFrame(draw);
const observer=app?new MutationObserver(()=>{if(app.children.length){observer.disconnect();setTimeout(dismiss,1550);}}):null;
if(observer)observer.observe(app,{childList:true,subtree:true});
if(app?.children.length)setTimeout(dismiss,1550);
setTimeout(dismiss,2600);
const revealImages=root=>{
 (root||document).querySelectorAll?.('img').forEach(img=>{
  if(img.complete&&img.naturalWidth){img.classList.add('kc-image-reveal');return;}
  if(!img.dataset.kcRevealBound){img.dataset.kcRevealBound='1';img.addEventListener('load',()=>img.classList.add('kc-image-reveal'),{once:true});}
 });
};
revealImages(document);
if(app)new MutationObserver(()=>revealImages(app)).observe(app,{childList:true,subtree:true});
})();