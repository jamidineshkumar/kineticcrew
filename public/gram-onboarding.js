(() => {
  'use strict';
  const KEY = 'kinetic_gram_tutorial_dismissed';
  const steps = [
    {eyebrow:'01 / SHARE',title:'Bring reels into Kinetic Gram',body:'Share a reel from another app to Kinetic Crew, or paste its link into the composer. Add your own caption before publishing.',visual:'<div class="kg-demo-share"><span class="kg-demo-app">Instagram</span><span class="kg-demo-arrow">↗</span><span class="kg-demo-app kg-demo-target">Kinetic Gram</span></div>'},
    {eyebrow:'02 / CAPTION',title:'Make the post yours',body:'Write a caption, add context and check the preview. Your post is not published until you choose Share.',visual:'<div class="kg-demo-card"><span class="kg-demo-label">YOUR CAPTION</span><b>Moments worth moving for ✨</b><small>Video link preview · Ready to share</small></div>'},
    {eyebrow:'03 / PLAY',title:'Watch in the app',body:'Tap a playable reel to open its full-screen player in Kinetic Gram. Playback depends on what the original platform allows third-party apps to embed.',visual:'<div class="kg-demo-phone"><div class="kg-demo-video"><span>▶</span><small>FULL-SCREEN REEL</small></div></div>'},
    {eyebrow:'04 / EXPLORE',title:'Swipe through reels',body:'Move vertically through available reels, discover crew moments and return to the feed whenever you like.',visual:'<div class="kg-demo-stack"><span>↑</span><b>REEL 02</b><small>Swipe to explore</small><span>↓</span></div>'},
    {eyebrow:'05 / ENGAGE',title:'React and join in',body:'Like posts, leave comments and share moments with your crew. Keep conversations respectful and relevant.',visual:'<div class="kg-demo-actions"><span>♥ Like</span><span>▢ Comment</span><span>↗ Share</span></div>'},
    {eyebrow:'06 / STORIES',title:'Catch the latest stories',body:'Stories highlight quick crew updates and moments. Tap a member’s story to view it when that feature is available.',visual:'<div class="kg-demo-stories"><i>KC</i><i>DN</i><i>✦</i><i>+</i></div>'},
    {eyebrow:'07 / CHATS',title:'Stay connected',body:'Use crew conversations to message people, coordinate plans and keep up with your community.',visual:'<div class="kg-demo-chat"><span>Hey, are we rehearsing today?</span><b>Yes — see you there!</b></div>'},
    {eyebrow:'08 / PRIVACY',title:'You control your space',body:'Review follow requests and privacy settings. Block or report accounts and only share content you have permission to share.',visual:'<div class="kg-demo-privacy"><span>✓</span><b>Your crew. Your controls.</b></div>'}
  ];
  let activeUser = null, index = 0, dontShow = false, busy = false;
  const esc = value => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function getUser() {
    try {
      const {data,error} = await window.kcSupabase.auth.getUser();
      if (error) throw error;
      activeUser = data.user;
      return activeUser;
    } catch (error) { console.warn('Gram tutorial account preference unavailable:', error); return null; }
  }
  function alreadyDismissed(user) {
    return user?.user_metadata?.[KEY] === true;
  }
  function render() {
    let root = document.getElementById('kgTutorial');
    if (!root) { root = document.createElement('div'); root.id = 'kgTutorial'; document.body.appendChild(root); }
    const step = steps[index];
    root.innerHTML = '<div class="kg-tutorial-backdrop"><section class="kg-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="kgTutorialTitle"><header class="kg-tutorial-head"><span class="kg-brand"><i>K</i><b>Kinetic <em>Gram</em></b></span><button type="button" class="kg-tutorial-close" data-kg-close aria-label="Close tutorial">×</button></header><div class="kg-tutorial-progress">'+steps.map((_,i)=>'<span class="'+(i<=index?'is-done':'')+'"></span>').join('')+'</div><div class="kg-tutorial-visual">'+step.visual+'</div><div class="kg-tutorial-copy"><small>'+step.eyebrow+'</small><h2 id="kgTutorialTitle">'+step.title+'</h2><p>'+step.body+'</p></div><label class="kg-tutorial-optout"><input type="checkbox" id="kgDontShow" '+(dontShow?'checked':'')+'><span>Don’t show this again on my devices</span></label><footer class="kg-tutorial-footer"><button type="button" class="kg-tutorial-skip" data-kg-close>Skip for now</button><div><button type="button" class="kg-tutorial-back" data-kg-back '+(index===0?'disabled':'')+'>Back</button><button type="button" class="kg-tutorial-next" data-kg-next>'+(index===steps.length-1?'Finish':'Next')+' <span>→</span></button></div></footer></section></div>';
    root.querySelector('#kgDontShow').addEventListener('change', event => { dontShow = event.target.checked; });
    root.querySelector('[data-kg-next]').addEventListener('click', advance);
    root.querySelector('[data-kg-back]').addEventListener('click', () => { if(index>0){index--;render();} });
    root.querySelectorAll('[data-kg-close]').forEach(button => button.addEventListener('click', closeForNow));
    root.querySelector('.kg-tutorial-dialog').focus?.();
  }
  async function persistOptOut() {
    if (!dontShow) return false;
    if (!activeUser) activeUser = await getUser();
    if (!activeUser || !window.kcSupabase?.auth?.updateUser) return false;
    const metadata = {...(activeUser.user_metadata||{}),[KEY]:true};
    const {data,error} = await window.kcSupabase.auth.updateUser({data:metadata});
    if (error) { console.warn('Could not save Gram tutorial preference:',error); return false; }
    activeUser = data.user || {...activeUser,user_metadata:metadata};
    return true;
  }
  async function advance() {
    if (busy) return;
    if (index < steps.length-1) { index++; render(); return; }
    busy = true;
    const button = document.querySelector('[data-kg-next]');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    const saved = await persistOptOut();
    if (dontShow && !saved) {
      busy = false;
      if (button) { button.disabled = false; button.textContent = 'Try again'; }
      const note = document.querySelector('.kg-tutorial-copy p');
      if (note) note.textContent = 'We couldn’t save this preference to your account. Please try again, or uncheck the option to finish for now.';
      return;
    }
    close();
  }
  function closeForNow() { close(); }
  function close() {
    document.getElementById('kgTutorial')?.remove();
    busy = false;
    index = 0;
    dontShow = false;
  }
  let lastFeedNode = null, checkTimer = null;
  async function checkFeed() {
    const feed = document.querySelector('#app .kc-feed-page');
    if (!feed || feed === lastFeedNode || document.getElementById('kgTutorial')) return;
    lastFeedNode = feed;
    const user = await getUser();
    if (!user || alreadyDismissed(user)) return;
    index = 0; dontShow = false; render();
  }
  const observer = new MutationObserver(() => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkFeed, 80);
  });
  function start() {
    const app = document.getElementById('app');
    if (!app) return;
    observer.observe(app,{childList:true,subtree:true});
    checkFeed();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
