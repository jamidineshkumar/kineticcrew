/* Kinetic Crew startup reveal + accessible progressive image reveal. */
(()=>{'use strict';
const revealImages=root=>{
 (root||document).querySelectorAll?.('img').forEach(img=>{
  if(img.complete&&img.naturalWidth){img.classList.add('kc-image-reveal');return;}
  if(!img.dataset.kcRevealBound){
   img.dataset.kcRevealBound='1';
   img.addEventListener('load',()=>img.classList.add('kc-image-reveal'),{once:true});
  }
 });
};
revealImages(document);
if(app)new MutationObserver(()=>revealImages(app)).observe(app,{childList:true,subtree:true});
})();