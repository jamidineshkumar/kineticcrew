/* Kinetic Crew global brand identity loader. */
(function(){
 'use strict';
 const CACHE_KEY='kc-global-brand-logo-v5';
 let activeUrl='', activeTargets={app:true,browser:true,pwa:true,signin:true,notifications:true}, manifestObjectUrl='';
 const validUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='lkdfjiweqxshbbcadfna.supabase.co'&&u.pathname==='/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png';}catch{return false;}};
 const isBrandImage=img=>{
  const src=img.getAttribute('src')||'', cls=String(img.className?.baseVal||img.className||'');
  return /kinetic-crew-logo\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(src)||/(^|[-_])logo($|[-_])|brandmark/i.test(cls)||/kinetic\s*crew\s*logo|crew\s*logo|brand\s*logo/i.test(img.alt||'')||img.hasAttribute('data-kc-brand')||img.dataset.kcBrandManaged==='true';
 };
 const showFallback=img=>{
  if(!(img instanceof HTMLImageElement)||!isBrandImage(img))return;
  img.dataset.kcBrandFailed='true';img.style.display='none';
  let node=img.nextElementSibling;
  if(!node?.classList?.contains('kc-brand-fallback')){
   node=document.createElement('span');node.className='kc-brand-fallback';node.textContent='KC';node.setAttribute('role','img');node.setAttribute('aria-label','Kinetic Crew');
   const w=img.getAttribute('width')||img.clientWidth||44,h=img.getAttribute('height')||img.clientHeight||44;
   node.style.cssText='display:inline-grid;place-items:center;box-sizing:border-box;width:'+w+'px;height:'+h+'px;min-width:28px;min-height:28px;aspect-ratio:1;border-radius:14px;background:#08080d;color:#fff;font:900 22px/1 system-ui,sans-serif;letter-spacing:-.08em;border:1px solid #ffffff22;box-shadow:inset 0 0 18px #e000a833;';
   img.insertAdjacentElement('afterend',node);
  }
 };
 const restoreImage=img=>{img.style.display='';img.dataset.kcBrandFailed='';const node=img.nextElementSibling;if(node?.classList?.contains('kc-brand-fallback'))node.remove();};
 const setImage=img=>{
  if(!(img instanceof HTMLImageElement)||!isBrandImage(img))return;
  const signin=!!document.querySelector('#kcAuthScreen');
  if(!img.dataset.kcBrandErrorBound){img.dataset.kcBrandErrorBound='true';img.addEventListener('error',()=>showFallback(img));img.addEventListener('load',()=>restoreImage(img));}
  if(img.complete&&img.naturalWidth===0)showFallback(img);else if(img.naturalWidth>0)restoreImage(img);
  if(signin?!activeTargets.signin:!activeTargets.app)return;
  if(activeUrl&&(img.getAttribute('src')||'')!==activeUrl){restoreImage(img);img.dataset.kcBrandManaged='true';img.src=activeUrl;}
 };
 const setLink=(selector,url)=>document.querySelectorAll(selector).forEach(link=>{if(link.href!==url)link.href=url;if(['icon','shortcut icon','apple-touch-icon'].includes(link.rel))link.type='image/png';});
 const applyManifest=async url=>{
  const link=document.querySelector('link[rel="manifest"]');if(!link)return;
  try{const response=await fetch(link.href,{cache:'no-store'});if(!response.ok)return;const manifest=await response.json();manifest.icons=[{src:url,sizes:'512x512',type:'image/png',purpose:'any maskable'}];const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});if(manifestObjectUrl)URL.revokeObjectURL(manifestObjectUrl);manifestObjectUrl=URL.createObjectURL(blob);link.href=manifestObjectUrl;}catch(error){console.info('Kinetic Crew install icon will refresh on the next manifest load.',error);}
 };
 const apply=(url,targets=activeTargets)=>{
  if(!validUrl(url))return false;
  activeUrl=url;activeTargets={app:true,browser:true,pwa:true,signin:true,notifications:true,...(targets||{})};window.KC_BRAND_LOGO_URL=url;window.KC_NOTIFICATION_ICON_URL=activeTargets.notifications?url:'';
  try{localStorage.setItem(CACHE_KEY,url);}catch{}
  const original=window.kcPath;
  if(typeof original==='function'&&!original.__kcBrandWrapped){const wrapped=function(path){const signin=!!document.querySelector('#kcAuthScreen'),selected=signin?activeTargets.signin:activeTargets.app;if(selected&&/(?:^|\/)kinetic-crew-logo\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(String(path||'')))return activeUrl;return original.call(this,path);};wrapped.__kcBrandWrapped=true;window.kcPath=wrapped;}
  if(activeTargets.app||activeTargets.signin)document.querySelectorAll('img').forEach(setImage);
  if(activeTargets.browser)setLink('link[rel="icon"],link[rel="shortcut icon"]',url);
  if(activeTargets.pwa){setLink('link[rel="apple-touch-icon"]',url);document.querySelectorAll('meta[name="msapplication-TileImage"]').forEach(meta=>meta.content=url);applyManifest(url);}
  return true;
 };
 window.kcApplyBrandLogo=apply;window.kcShowBrandFallback=showFallback;
 try{const cached=localStorage.getItem(CACHE_KEY);if(cached)apply(cached);}catch{}
 if(window.kcSupabase)window.kcSupabase.rpc('crew_get_brand_identity').then(({data,error})=>{if(!error&&data&&validUrl(data.logo_url))apply(data.logo_url,data.targets);else if(!error)return window.kcSupabase.rpc('crew_get_brand_logo').then(({data:url,error:legacyError})=>{if(!legacyError&&typeof url==='string')apply(url);});}).catch(error=>console.info('Using cached Kinetic Crew logo until the brand setting is available.',error));
 const observer=new MutationObserver(records=>records.forEach(record=>{if(record.type==='attributes'&&record.target instanceof HTMLImageElement)setImage(record.target);record.addedNodes?.forEach(node=>{if(node.nodeType!==Node.ELEMENT_NODE)return;if(node instanceof HTMLImageElement)setImage(node);node.querySelectorAll?.('img').forEach(setImage);});}));
 const start=()=>{document.querySelectorAll('img').forEach(setImage);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();