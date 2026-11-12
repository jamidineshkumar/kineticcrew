/* Lightweight first-load RGB halftone bloom. It runs once and never blocks navigation. */
(()=>{'use strict';
const app=document.getElementById('app');
const overlay=document.createElement('div');
overlay.className='kc-transition-overlay';overlay.setAttribute('aria-hidden','true');
overlay.innerHTML='<canvas class="kc-transition-canvas"></canvas>';document.body.appendChild(overlay);
const canvas=overlay.querySelector('canvas'),ctx=canvas.getContext('2d',{alpha:false,desynchronized:true});
let raf=0,closed=false,w=0,h=0,dpr=1,started=0,lastFrame=0,appReady=!!app?.children.length;
const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const BLACK='#03030a';
function resize(){dpr=Math.min(window.devicePixelRatio||1,1.25);w=innerWidth;h=innerHeight;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
function color(t){const stops=[[0,[0,205,242]],[.19,[0,112,255]],[.38,[116,40,255]],[.58,[222,20,211]],[.77,[255,44,111]],[.94,[255,116,25]],[1,[255,178,35]]];for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const a=stops[i-1],b=stops[i],q=(t-a[0])/(b[0]-a[0]);return a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*q));}return stops[stops.length-1][1];}
const ease=t=>1-Math.pow(1-t,3);
function draw(now){
 if(closed)return;
 if(now-lastFrame<30){raf=requestAnimationFrame(draw);return;}lastFrame=now;
 if(!started)started=now;const elapsed=now-started;
 ctx.fillStyle=BLACK;ctx.fillRect(0,0,w,h);
 const delay=180,duration=1450,raw=Math.max(0,Math.min(1,(elapsed-delay)/duration));
 if(raw>0){
  const bloom=ease(raw),scale=Math.max(1,Math.hypot(w,h)*.68*bloom),step=Math.max(10,Math.min(14,w/48)),rot=elapsed*.000025;
  for(let py=step/2;py<h;py+=step)for(let px=step/2;px<w;px+=step){
   const dx=(px-w*.5)/scale,dy=(py-h*.5)/scale,c=Math.cos(rot),sn=Math.sin(rot),x=dx*c-dy*sn,y=dx*sn+dy*c;
   const rr=Math.hypot(x,y),ang=Math.atan2(y,x),wave=Math.sin(ang*2.1+rr*5.4+elapsed*.0008)*.07+Math.sin(ang*3.2-rr*3.1)*.03,ring=rr+wave;
   if(ring<.22||ring>1.08)continue;
   const edge=Math.min((ring-.22)/.14,(1.08-ring)/.16,1),depth=.78+.22*Math.cos(ang*2+rr*2.6+elapsed*.0004),perspective=1+.13*Math.sin(ang*2.4+elapsed*.0003+rr*3);
   const t=((ang+Math.PI)/(Math.PI*2)+.08+rr*.12)%1,rgb=color(t),size=(1.1+Math.pow(Math.max(0,1-Math.abs(ring-.68)/.42),1.7)*2.1)*depth*Math.max(.1,edge);
   const alpha=Math.min(.96,edge*(.5+.5*depth)*Math.min(1,bloom*2.6));
   ctx.fillStyle='rgba('+rgb.join(',')+','+alpha+')';ctx.beginPath();ctx.ellipse(w*.5+x*scale*perspective,h*.5+y*scale*.94*perspective,size*perspective,size*1.12,0,0,Math.PI*2);ctx.fill();
  }
 }
 if(elapsed<delay+duration)raf=requestAnimationFrame(draw);else finish();
}
let finished=false;
function finish(){if(finished||closed)return;finished=true;const ready=()=>{if(appReady||performance.now()-started>3900)dismiss();else setTimeout(ready,60);};setTimeout(ready,180);}
function dismiss(){if(closed)return;closed=true;cancelAnimationFrame(raf);overlay.classList.add('is-leaving');setTimeout(()=>overlay.remove(),380);}
resize();addEventListener('resize',resize,{passive:true});
if(reduced){dismiss();}else raf=requestAnimationFrame(draw);
const observer=app?new MutationObserver(()=>{if(app.children.length){appReady=true;observer.disconnect();}}):null;if(observer)observer.observe(app,{childList:true});
setTimeout(()=>{appReady=true;if(finished)dismiss();},4100);
})();
