(() => {
  'use strict';
  const root=document.getElementById('kcGlobalSearch'),input=document.getElementById('kcGlobalSearchInput'),results=document.getElementById('kcGlobalSearchResults');
  if(!root||!input||!results)return;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
  let filter='all',matches=[],loading=false;
  async function refreshIndex(){const api=window.KC_SEARCH_API;if(!api)return;loading=true;results.hidden=false;results.innerHTML='<div class="kc-search-empty">Searching your crew…</div>';try{await api.load?.();}catch(error){console.warn('Crew search index:',error);}finally{loading=false;render();}}
  function collect(){const d=window.KC_SEARCH_API?.snapshot?.()||{},items=[];
    (d.members||[]).forEach(p=>items.push({type:'people',label:p.name||'Crew member',detail:'@'+(p.username||'crew-member')+' · '+(p.role||'Member'),text:[p.name,p.username,p.role,p.bio].join(' '),id:p.auth_id}));
    (d.events||[]).forEach(e=>items.push({type:'events',label:e.title||'Crew event',detail:[e.location,e.starts_at?new Date(e.starts_at).toLocaleDateString():''].filter(Boolean).join(' · '),text:[e.title,e.description,e.location].join(' '),id:e.id}));
    (d.posts||[]).forEach(p=>items.push({type:'posts',label:p.title||p.body||'Kinetic Gram post',detail:'Kinetic Gram · '+(p.created_at?new Date(p.created_at).toLocaleDateString():''),text:[p.title,p.body,p.caption,p.link_url].join(' '),id:p.id}));
    (d.announcements||[]).forEach(a=>items.push({type:'updates',label:a.title||'Crew update',detail:'Announcement',text:[a.title,a.body,a.author_name].join(' '),id:a.id}));
    return items.filter(x=>x.label&&x.id!=null);
  }
  function render(){if(loading)return;const q=norm(input.value);if(!q){results.hidden=true;results.innerHTML='';return;}const terms=q.split(/\s+/).filter(Boolean);
    matches=collect().map(item=>{const label=norm(item.label),hay=norm(label+' '+item.detail+' '+item.text),score=terms.reduce((n,t)=>n+(hay.includes(t)?(label.includes(t)?3:1):-6),0);return {...item,score};}).filter(x=>x.score>=0&&(filter==='all'||x.type===filter)).sort((a,b)=>b.score-a.score).slice(0,30);
    const filters=[['all','All'],['people','People'],['events','Events'],['posts','Posts'],['updates','Updates']];
    results.innerHTML='<div class="kc-search-filter-row">'+filters.map(([k,v])=>'<button type="button" data-search-filter="'+k+'" class="'+(filter===k?'active':'')+'">'+v+'</button>').join('')+'</div>'+(matches.length?'<div class="kc-search-result-list">'+matches.map((x,i)=>'<button type="button" class="kc-search-result" data-search-index="'+i+'"><span class="kc-search-result-type">'+({people:'♙',events:'▦',posts:'◈',updates:'↗'}[x.type])+'</span><span><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></span><span>↗</span></button>').join('')+'</div>':'<div class="kc-search-empty"><b>No matching results</b><span>Try a name, event title, post keyword or update.</span></div>');results.hidden=false;
  }
  input.addEventListener('focus',()=>{if(!input.dataset.indexed){input.dataset.indexed='yes';refreshIndex();}else if(input.value.trim())render();});
  input.addEventListener('input',()=>{filter='all';render();});
  input.addEventListener('keydown',e=>{if(e.key==='Escape'){results.hidden=true;input.blur();}if(e.key==='Enter'&&matches.length)results.querySelector('[data-search-index="0"]')?.click();});
  results.addEventListener('click',e=>{const f=e.target.closest('[data-search-filter]');if(f){filter=f.dataset.searchFilter;render();return;}const b=e.target.closest('[data-search-index]');if(!b)return;const item=matches[Number(b.dataset.searchIndex)];if(!item)return;results.hidden=true;input.value='';const api=window.KC_SEARCH_API;if(item.type==='events')api?.openEvent?.(item.id);else if(item.type==='people')api?.openProfile?.(item.id);else if(item.type==='posts')api?.openPost?.(item.id);else api?.openView?.('notifications');});
  document.addEventListener('click',e=>{if(!root.contains(e.target))results.hidden=true;});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus();input.select();refreshIndex();}});
})();