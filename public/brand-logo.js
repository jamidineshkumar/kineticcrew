/* Kinetic Crew destination-specific brand identity loader. */
(function(){
 'use strict';
 const CACHE_KEY='kc-global-brand-logo-v6';
 const KEYS=['app','browser','pwa','signin','email','notifications'];
 let activeAssets={},activeTargets={app:true,browser:true,pwa:true,signin:true,email:false,notifications:true},legacyUrl='',manifestObjectUrl='';
 const validUrl=(value,key)=>{try{const u=new URL(String(value||''));if(u.protocol!=='https:'||u.hostname!=='lkdfjiweqxshbbcadfna.supabase.co')return false;return u.pathname==='/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png'||(u.pathname.startsWith('/storage/v1/object/public/crew-brand-assets/brand/destinations/')&&u.pathname.endsWith('.png')&&(!key||u.pathname.endsWith('/'+key+'.png')));}catch{return false;}};
 const urlFor=key=>(activeAssets[key]&&validUrl(activeAssets[key],key)?activeAssets[key]:'')|| (legacyUrl&&validUrl(legacyUrl)?legacyUrl:'');
 const isBrandImage=img=>{const src=img.getAttribute('src')||'',cls=String(img.className?.baseVal||img.className||'');return /kinetic-crew-logo\\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(src)||/(^|[-_])logo($|[-_])|brandmark/i.test(cls)||/kinetic\\s*crew\\s*logo|crew\\s*logo|brand\\s*logo/i.test(img.alt||'')||img.hasAttribute('data-kc-brand')||img.dataset.kcBrandManaged==='true';};
 const showFallback=img=>{if(!(img instanceof HTMLImageElement)||!isBrandImage(img))return;img.dataset.kcBrandFailed='true';img.style.display='none';let node=img.nextElementSibling;if(!node?.classList?.contains('kc-brand-fallback')){node=document.createElement('span');node.className='kc-brand-fallback';node.textContent='KC';node.setAttribute('role','img');node.setAttribute('aria-label','Kinetic Crew');const w=img.getAttribute('width')||img.clientWidth||44,h=img.getAttribute('height')||img.clientHeight||44;node.style.cssText='display:inline-grid;place-items:center;box-sizing:border-box;width:'+w+'px;height:'+h+'px;min-width:28px;min-height:28px;aspect-ratio:1;border-radius:14px;background:#08080d;color:#fff;font:900 22px/1 system-ui,sans-serif;letter-spacing:-.08em;border:1px solid #ffffff22;box-shadow:inset 0 0 18px #e000a833;';img.insertAdjacentElement('afterend',node);}};
 const restoreImage=img=>{img.style.display='';img.dataset.kcBrandFailed='';const node=img.nextElementSibling;if(node?.classList?.contains('kc-brand-fallback'))node.remove();};
 const setImage=img=>{if(!(img instanceof HTMLImageElement)||!isBrandImage(img))return;const signin=!!document.querySelector('#kcAuthScreen');if(!img.dataset.kcBrandErrorBound){img.dataset.kcBrandErrorBound='true';img.addEventListener('error',()=>showFallback(img));img.addEventListener('load',()=>restoreImage(img));}if(img.complete&&img.naturalWidth===0)showFallback(img);else if(img.naturalWidth>0)restoreImage(img);const url=urlFor(signin?'signin':'app');if(!url||!(signin?activeTargets.signin:activeTargets.app))return;if(img.getAttribute('src')!==url){restoreImage(img);img.dataset.kcBrandManaged='true';img.src=url;}};
 const setLink=(selector,url)=>{if(!url)return;document.querySelectorAll(selector).forEach(link=>{if(link.href!==url)link.href=url;if(['icon','shortcut icon','apple-touch-icon'].includes(link.rel))link.type='image/png';});};
 const applyManifest=async url=>{const link=document.querySelector('link[rel="manifest"]');if(!link||!url)return;try{const response=await fetch(link.href,{cache:'no-store'});if(!response.ok)return;const manifest=await response.json();manifest.icons=[{src:url,sizes:'512x512',type:'image/png',purpose:'any maskable'}];const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});if(manifestObjectUrl)URL.revokeObjectURL(manifestObjectUrl);manifestObjectUrl=URL.createObjectURL(blob);link.href=manifestObjectUrl;}catch(error){console.info('Kinetic Crew install icon will refresh on the next manifest load.',error);}};
 const apply=(assets,targets=activeTargets,legacy='')=>{
  if(typeof assets==='string'){legacy=assets;assets={};}
  if(!assets||typeof assets!=='object')assets={};
  activeAssets=Object.fromEntries(KEYS.filter(key=>validUrl(assets[key],key)).map(key=>[key,assets[key]]));
  legacyUrl=validUrl(legacy)?legacy:'';
  activeTargets={app:true,browser:true,pwa:true,signin:true,email:false,notifications:true,...(targets||{})};
  window.KC_BRAND_LOGO_URL=urlFor('app')||legacyUrl;
  window.KC_BRAND_LOGO_ASSETS={...activeAssets};
  window.KC_NOTIFICATION_ICON_URL=activeTargets.notifications?urlFor('notifications'):'';
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({assets:activeAssets,targets:activeTargets,legacy:legacyUrl}));}catch{}
  const original=window.kcPath;
  if(typeof original==='function'&&!original.__kcBrandWrapped){const wrapped=function(path){const signin=!!document.querySelector('#kcAuthScreen'),selected=signin?activeTargets.signin:activeTargets.app,url=urlFor(signin?'signin':'app');if(selected&&url&&/(?:^|\\/)kinetic-crew-logo\\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(String(path||'')))return url;return original.call(this,path);};wrapped.__kcBrandWrapped=true;window.kcPath=wrapped;}
  if(activeTargets.app||activeTargets.signin)document.querySelectorAll('img').forEach(setImage);
  if(activeTargets.browser)setLink('link[rel="icon"],link[rel="shortcut icon"]',urlFor('browser'));
  if(activeTargets.pwa){const pwaUrl=urlFor('pwa');setLink('link[rel="apple-touch-icon"]',pwaUrl);document.querySelectorAll('meta[name="msapplication-TileImage"]').forEach(meta=>{if(pwaUrl)meta.content=pwaUrl;});applyManifest(pwaUrl);}
  return true;
 };
 window.kcApplyBrandLogo=apply;window.kcShowBrandFallback=showFallback;
 try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(cached)apply(cached.assets,cached.targets,cached.legacy);else{const old=localStorage.getItem('kc-global-brand-logo-v5');if(old)apply(old);}}catch{}
 if(window.kcSupabase)window.kcSupabase.rpc('crew_get_brand_identity').then(({data,error})=>{if(!error&&data)apply(data.assets||{},data.targets||{},data.logo_url||'');else if(!error)return window.kcSupabase.rpc('crew_get_brand_logo').then(({data:url,error:legacyError})=>{if(!legacyError&&typeof url==='string')apply(url);});}).catch(error=>console.info('Using cached Kinetic Crew logo until the brand setting is available.',error));
 const observer=new MutationObserver(records=>records.forEach(record=>{if(record.type==='attributes'&&record.target instanceof HTMLImageElement)setImage(record.target);record.addedNodes?.forEach(node=>{if(node.nodeType!==Node.ELEMENT_NODE)return;if(node instanceof HTMLImageElement)setImage(node);node.querySelectorAll?.('img').forEach(setImage);});}));
 const start=()=>{document.querySelectorAll('img').forEach(setImage);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
