(()=>{'use strict';
const $=s=>document.querySelector(s);
const mascot=(extra='')=>`<svg class="kc-bobo-svg ${extra}" viewBox="0 0 500 340" role="img" aria-label="BOBO, Kinetic Crew companion">
<defs>
 <linearGradient id="boboHair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#26313b"/><stop offset=".55" stop-color="#080d13"/><stop offset="1" stop-color="#ff8b35"/></linearGradient>
 <linearGradient id="boboSkin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffd9b4"/><stop offset="1" stop-color="#d99569"/></linearGradient>
 <linearGradient id="boboHood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#30333a"/><stop offset="1" stop-color="#08090d"/></linearGradient>
 <linearGradient id="boboOrange" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffc06b"/><stop offset="1" stop-color="#f36c19"/></linearGradient>
 <filter id="boboGlow"><feGaussianBlur stdDeviation="7"/></filter>
</defs>
<ellipse cx="250" cy="316" rx="145" ry="15" fill="#ff852b" opacity=".17" filter="url(#boboGlow)"/>
<g class="bobo-body">
 <path d="M145 326 Q148 242 198 226 L302 226 Q352 242 355 326Z" fill="url(#boboHood)" stroke="#55515a" stroke-width="3"/>
 <path d="M188 245 Q250 285 312 245 L300 326H200Z" fill="#15171d"/>
 <path d="M215 270 Q250 285 285 270" fill="none" stroke="#ff8b35" stroke-width="4" opacity=".8"/>
 <text x="250" y="309" text-anchor="middle" fill="#ff9a43" font-family="Arial" font-weight="900" font-size="24">KC</text>
 <path class="bobo-arm-left" d="M171 254 Q127 259 119 297 Q116 315 137 319 Q154 322 163 300 L195 278Z" fill="url(#boboHood)" stroke="#45424a" stroke-width="3"/>
 <path class="bobo-arm-right" d="M329 254 Q373 259 381 297 Q384 315 363 319 Q346 322 337 300 L305 278Z" fill="url(#boboHood)" stroke="#45424a" stroke-width="3"/>
</g>
<g class="bobo-head">
 <path d="M147 145 Q132 63 206 48 Q280 15 342 82 Q374 113 353 193 Q340 242 290 252 L202 247 Q151 222 147 145Z" fill="url(#boboHair)"/>
 <path d="M158 133 Q120 88 177 54 Q193 12 242 35 Q280 3 311 49 Q361 40 367 99 Q339 80 316 89 Q287 52 255 81 Q220 47 191 103 Q177 91 158 133Z" fill="#101720" stroke="#3c454e" stroke-width="4"/>
 <path d="M176 135 Q165 106 183 88 Q201 70 224 81 Q249 57 276 79 Q309 67 333 95 Q351 122 340 177 Q336 228 291 244 Q238 263 192 229 Q165 205 176 135Z" fill="url(#boboSkin)"/>
 <path d="M175 116 Q192 78 224 84 Q251 59 279 83 Q314 70 339 105 Q322 98 304 109 Q276 91 254 112 Q224 91 203 125 Q188 114 175 136Z" fill="#111820"/>
 <path d="M166 142 Q132 124 145 168 Q151 193 177 190" fill="#f0b58d" stroke="#bd805f" stroke-width="4"/>
 <path d="M345 142 Q373 124 360 168 Q354 193 334 190" fill="#f0b58d" stroke="#bd805f" stroke-width="4"/>
 <g class="bobo-eyes">
  <ellipse cx="218" cy="159" rx="18" ry="23" fill="#fff"/>
  <ellipse cx="285" cy="159" rx="18" ry="23" fill="#fff"/>
  <g class="bobo-pupils"><ellipse cx="222" cy="162" rx="9" ry="13" fill="#25170f"/><ellipse cx="289" cy="162" rx="9" ry="13" fill="#25170f"/><circle cx="225" cy="156" r="4" fill="#fff"/><circle cx="292" cy="156" r="4" fill="#fff"/></g>
  <g class="bobo-lids"><path d="M197 160 Q218 182 239 160 M264 160 Q285 182 306 160" fill="none" stroke="#4a261b" stroke-width="7" stroke-linecap="round"/></g>
  <path d="M199 129 Q218 119 236 129 M267 129 Q285 119 303 129" fill="none" stroke="#38231b" stroke-width="7" stroke-linecap="round"/>
 </g>
 <path d="M243 184 Q250 190 258 184" fill="none" stroke="#bd805f" stroke-width="4" stroke-linecap="round"/>
 <path class="bobo-mouth" d="M224 203 Q250 224 276 203" fill="none" stroke="#8b4039" stroke-width="5" stroke-linecap="round"/>
 <ellipse cx="201" cy="190" rx="13" ry="7" fill="#ed8f7b" opacity=".5"/><ellipse cx="300" cy="190" rx="13" ry="7" fill="#ed8f7b" opacity=".5"/>
 <path d="M152 117 Q139 149 156 187" fill="none" stroke="url(#boboOrange)" stroke-width="13" stroke-linecap="round"/>
 <path d="M354 117 Q367 149 350 187" fill="none" stroke="url(#boboOrange)" stroke-width="13" stroke-linecap="round"/>
 <circle cx="153" cy="158" r="20" fill="#17191f" stroke="#ff8b35" stroke-width="7"/><circle cx="353" cy="158" r="20" fill="#17191f" stroke="#ff8b35" stroke-width="7"/>
 <path d="M141 158h24" stroke="#ffb16b" stroke-width="4"/>
 <g class="bobo-cover"><path d="M188 150 Q190 127 210 132 Q224 136 228 154 L236 177 Q240 192 225 195 Q214 198 207 181Z" fill="url(#boboSkin)" stroke="#c58c68" stroke-width="3"/><path d="M270 154 Q274 132 291 132 Q311 132 312 153 L293 181 Q284 195 272 190 Q261 185 270 154Z" fill="url(#boboSkin)" stroke="#c58c68" stroke-width="3"/></g>
</g>
</svg>`;
function stage(kind){const el=document.createElement('div');el.className=kind==='welcome'?'kc-bobo-welcome':'kc-bobo-auth';el.innerHTML=mascot(kind==='welcome'?'is-welcome':'')+(kind==='welcome'?'<div class="kc-bobo-speech">Namasthe! 🙏<br>Welcome to Kinetic Crew!</div>':'');return el;}
const welcome=$('.kc-entry-welcome'),brand=$('.kc-welcome-brand'),copy=$('.kc-welcome-copy');
if(welcome&&brand&&copy&&!welcome.querySelector('.kc-bobo-welcome'))welcome.insertBefore(stage('welcome'),copy);
const auth=$('#kcAuthScreen'),form=$('#loginForm');
if(auth&&form&&!auth.querySelector('.kc-bobo-auth'))form.parentElement.insertBefore(stage('auth'),form);
const svg=()=>document.querySelectorAll('.kc-bobo-svg');
/* Friendly child-like BOBO voice. Uses the device's built-in speech engine; no audio is sent to a server. */
const voiceState={enabled:true,voices:[],lastSpoken:0};
const speech=window.speechSynthesis;
function chooseVoice(){
 if(!speech)return null;
 const voices=speech.getVoices?.()||[];
 const preferred=voices.filter(v=>/^en(-IN|-GB|-US)?$/i.test(v.lang)||/^en-/i.test(v.lang));
 return preferred.find(v=>/child|kid|junior|female|girl|natural|neural/i.test(v.name))||
 preferred.find(v=>/Google.*English|Microsoft.*(Aria|Jenny|Sonia|Ava|Emma|Ana|Neerja)/i.test(v.name))||
 preferred.find(v=>/en-IN/i.test(v.lang))||preferred[0]||voices[0]||null;
}
if(speech){voiceState.voices=speech.getVoices?.()||[];speech.addEventListener?.('voiceschanged',()=>{voiceState.voices=speech.getVoices?.()||[];});}
function speak(line,force=false){
 if(!speech||!line||(!voiceState.enabled&&!force))return;
 const now=Date.now();if(!force&&now-voiceState.lastSpoken<1800)return;
 voiceState.lastSpoken=now;
 try{speech.cancel();const utterance=new SpeechSynthesisUtterance(line);const voice=chooseVoice();if(voice)utterance.voice=voice;utterance.lang=voice?.lang||'en-IN';utterance.rate=.88;utterance.pitch=1.55;utterance.volume=.92;speech.speak(utterance);}catch(error){console.info('BOBO voice unavailable on this device.',error);}
}
function addVoiceControl(){
 const welcomeActions=$('.kc-welcome-actions');
 if(welcomeActions&&!$('#kcBoboVoiceToggle')){
  const button=document.createElement('button');button.type='button';button.id='kcBoboVoiceToggle';button.className='kc-bobo-voice-toggle';button.innerHTML='<span aria-hidden="true">🔊</span> Hear BOBO';button.setAttribute('aria-pressed','true');
  button.addEventListener('click',()=>{voiceState.enabled=!voiceState.enabled;button.setAttribute('aria-pressed',String(voiceState.enabled));button.innerHTML=voiceState.enabled?'<span aria-hidden="true">🔊</span> Hear BOBO':'<span aria-hidden="true">🔇</span> Voice off';if(voiceState.enabled)speak('Namasthe! Welcome to Kinetic Crew! I am Bobo. Let us get started!',true);else speech?.cancel();});
  welcomeActions.appendChild(button);
 }
}
addVoiceControl();
document.querySelectorAll('[data-auth-open]').forEach(btn=>btn.addEventListener('click',()=>{if(voiceState.enabled)speak(btn.dataset.authOpen==='signup'?'Yay! Let us create your crew account!':'Namasthe! Welcome back! Enter your username and I will follow along.');}));
const welcomeSpeech=$('.kc-welcome-copy');
if(welcomeSpeech){const startVoice=()=>{if(voiceState.enabled)speak('Namasthe! Welcome to Kinetic Crew! I am Bobo, your little crew buddy. Let me help you get started.');};document.addEventListener('pointerdown',startVoice,{once:true,passive:true});document.addEventListener('keydown',startVoice,{once:true});}

function setState(state){svg().forEach(el=>{el.classList.toggle('is-password',state==='password'||state==='peeking');el.classList.toggle('is-peeking',state==='peeking');el.classList.toggle('is-happy',state==='happy');el.classList.toggle('is-error',state==='error');});}
function follow(input){const value=input.value||'',len=value.length,selection=input.selectionStart??len,ratio=Math.min(1,selection/Math.max(1,input.maxLength||Math.max(24,len||24)));const x=(ratio-.5)*11;svg().forEach(el=>{el.style.setProperty('--bobo-eye-x',x.toFixed(1)+'px');el.style.setProperty('--bobo-eye-y',(input.type==='password'?0:Math.min(3,len*.12))+'px');});}
function attach(input){if(!input||input.dataset.boboBound)return;input.dataset.boboBound='1';input.addEventListener('focus',()=>{setState(input.type==='password'?'password':'');follow(input);if(input.type!=='password'&&voiceState.enabled)speak(input.id==='loginUsername'?'Tell me your crew username!':input.id==='fullName'?'What should I call you?':'I am watching your typing!');});input.addEventListener('input',()=>{follow(input);if(input.type==='password')setState('password');});input.addEventListener('click',()=>follow(input));input.addEventListener('keyup',()=>follow(input));}
document.querySelectorAll('#loginUsername,#fullName,#newUsername,#newEmail,#verifyCode').forEach(attach);
document.querySelectorAll('#loginPassword,#newPassword,#confirmPassword').forEach(input=>{attach(input);const wrap=document.createElement('span');wrap.className='kc-bobo-field-wrap';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);const button=document.createElement('button');button.type='button';button.className='kc-bobo-reveal';button.setAttribute('aria-label','Show password');button.textContent='◉';wrap.appendChild(button);button.addEventListener('click',()=>{const reveal=input.type==='password';input.type=reveal?'text':'password';button.setAttribute('aria-label',reveal?'Hide password':'Show password');button.textContent=reveal?'◎':'◉';setState(reveal?'peeking':'password');if(voiceState.enabled)speak(reveal?'Oh! I can see it now!':'Oops! My eyes are closed. Your password is secret!');});});
document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',()=>{setState('happy');if(voiceState.enabled)speak('Fingers crossed! Let us do this!');}));
const message=$('#message');if(message){new MutationObserver(()=>{if(message.classList.contains('error')&&message.textContent.trim()){setState('error');if(voiceState.enabled)speak('Oopsie! That did not work. Let us try again!');}else if(message.textContent.trim()){setState('happy');if(voiceState.enabled)speak('Yay! That worked!');}}).observe(message,{childList:true,subtree:true,characterData:true});}
document.querySelectorAll('[data-auth-open]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{auth?.querySelector('input')?.focus({preventScroll:true});},250)));
})();
