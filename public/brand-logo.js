/* Kinetic Crew global brand identity loader.
   Reads the public logo setting and updates all app, browser and PWA logo surfaces. */
(function(){
 'use strict';
 const FALLBACK=(()=>{try{return window.kcPath('kinetic-crew-logo.svg');}catch{return 'kinetic-crew-logo.svg';}})();
 const CACHE_KEY='kc-global-brand-logo-v2';
 let activeUrl='';
 let manifestObjectUrl='';
 const validUrl=value=>{
  try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='lkdfjiweqxshbbcadfna.supabase.co'&&u.pathname==='/storage/v1/object/public/crew-brand-assets/brand/kinetic-crew-logo.png';}catch{return false;}
 };
 const setImage=img=>{
  if(!(img instanceof HTMLImageElement))return;
  const src=img.getAttribute('src')||'';
  if(activeUrl&&/kinetic-crew-logo\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(src)&&src!==activeUrl){
   img.dataset.kcBrandManaged='true';img.src=activeUrl;
  }
 };
 const setLink=(selector,url)=>{
  document.querySelectorAll(selector).forEach(link=>{if(link.href!==url)link.href=url;if(link.rel==='icon'||link.rel==='shortcut icon'||link.rel==='apple-touch-icon')link.type='image/png';});
 };
 const applyManifest=async url=>{
  const link=document.querySelector('link[rel="manifest"]');if(!link)return;
  try{
   const response=await fetch(link.href,{cache:'no-store'});if(!response.ok)return;
   const manifest=await response.json();
   manifest.icons=[{src:url,sizes:'512x512',type:'image/png',purpose:'any maskable'}];
   const blob=new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'});
   if(manifestObjectUrl)URL.revokeObjectURL(manifestObjectUrl);
   manifestObjectUrl=URL.createObjectURL(blob);link.href=manifestObjectUrl;
  }catch(error){console.info('Kinetic Crew install icon will refresh on the next manifest load.',error);}
 };
 const apply=url=>{
  if(!validUrl(url))return false;
  activeUrl=url;window.KC_BRAND_LOGO_URL=url;
  try{localStorage.setItem(CACHE_KEY,url);}catch{}
  const original=window.kcPath;
  if(typeof original==='function'&&!original.__kcBrandWrapped){
   const wrapped=function(path){if(/(?:^|\/)kinetic-crew-logo\.(?:svg|jpe?g|png|webp)(?:[?#]|$)/i.test(String(path||'')))return activeUrl;return original.call(this,path);};
   wrapped.__kcBrandWrapped=true;window.kcPath=wrapped;
  }
  document.querySelectorAll('img').forEach(setImage);
  setLink('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]',url);
  document.querySelectorAll('meta[name="msapplication-TileImage"]').forEach(meta=>meta.content=url);
  applyManifest(url);
  return true;
 };
 window.kcApplyBrandLogo=apply;
 try{const cached=localStorage.getItem(CACHE_KEY);if(cached)apply(cached);}catch{}
 if(window.kcSupabase){
  window.kcSupabase.rpc('crew_get_brand_logo').then(({data,error})=>{
   if(!error&&typeof data==='string'&&validUrl(data))apply(data);
  }).catch(error=>console.info('Using cached Kinetic Crew logo until the brand setting is available.',error));
 }
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'&&record.target instanceof HTMLImageElement)setImage(record.target);
   record.addedNodes?.forEach(node=>{
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    if(node instanceof HTMLImageElement)setImage(node);
    node.querySelectorAll?.('img').forEach(setImage);
   });
  }
 });
 const start=()=>observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
