const b64uToBytes=value=>{const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const padded=s+'='.repeat((4-s.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));};
const bytesToB64u=value=>{const bytes=new Uint8Array(value);let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
async function api(action,response){
 if(!window.PublicKeyCredential||!navigator.credentials)throw new Error('This browser does not support secure device authentication. Update Chrome and try again.');
 if(location.hostname!=='kineticcrew.vercel.app')throw new Error('Device authentication is currently configured for the official Kinetic Crew app only.');
 const {data,error}=await window.kcSupabase.auth.getSession();if(error)throw error;
 const token=data?.session?.access_token;if(!token)throw new Error('Your session has expired. Sign in again.');
 const config=window.KC_CONFIG||{};
 const res=await fetch(config.supabaseUrl+'/functions/v1/kc-webauthn',{method:'POST',headers:{'Content-Type':'application/json','apikey':config.supabaseAnonKey,'Authorization':'Bearer '+token},body:JSON.stringify({action,response})});
 const payload=await res.json().catch(()=>({error:'The device authentication service returned an invalid response.'}));
 if(!res.ok)throw new Error(payload.error||'Device authentication failed.');return payload;
}
function isSupported(){return !!(window.PublicKeyCredential&&navigator.credentials&&window.isSecureContext);}
async function checkKCBiometric(){
 if(!isSupported())return {native:false,availability:{isAvailable:false,reason:'Secure device authentication is not supported in this browser.'},registered:false};
 if(!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)return {native:false,availability:{isAvailable:false,reason:'This Chrome version cannot check for an Android platform authenticator.'},registered:false};
 const platform=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
 if(!platform)return {native:false,availability:{isAvailable:false,reason:'No Android fingerprint, face, or secure screen-lock authenticator is available to Chrome.'},registered:false};
 const status=await api('status');
 return {native:false,availability:{isAvailable:!!status.registered,platformAvailable:true,reason:status.registered?'':'Register this device once to enable fingerprint or face unlock.'},registered:!!status.registered,credentialCount:Number(status.credentialCount||0)};
}
async function registerKCBiometric(){
 if(!isSupported())throw new Error('Open Kinetic Crew in the installed Chrome app on a secure connection.');
 if(!await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw new Error('This Android device does not expose a platform authenticator to Chrome. Check that a screen lock and fingerprint or face unlock are enrolled.');
 const options=await api('registration-options');
 options.challenge=b64uToBytes(options.challenge);options.user.id=b64uToBytes(options.user.id);
 options.excludeCredentials=(options.excludeCredentials||[]).map(x=>({...x,id:b64uToBytes(x.id)}));
 let credential;
 try{credential=await navigator.credentials.create({publicKey:options});}
 catch(error){
  const name=String(error?.name||'');
  if(name==='NotReadableError')throw new Error('Android Credential Manager could not create the passkey. This is usually an Android password-manager/provider problem, not your Kinetic Crew mPIN. Update Chrome and Google Play services, then set Google Password Manager as your passkey provider in Android Settings → Passwords, passkeys & accounts. If it still fails, try the same Kinetic Crew page in Firefox to check whether this is Chrome-specific.');
  if(name==='NotSupportedError')throw new Error('Android reports that its passkey/password store is unavailable. Enable Google Password Manager or another passkey provider in Android Settings → Passwords, passkeys & accounts.');
  if(name==='SecurityError')throw new Error('Android rejected the website origin for passkey creation. Open the official https://kineticcrew.vercel.app address directly.');
  throw new Error('Android passkey registration failed ('+(name||'unknown error')+'): '+String(error?.message||'Try again after checking your Android passkey provider.'));
 }
 if(!credential)throw new Error('Device registration was cancelled.');
 const response={id:credential.id,rawId:bytesToB64u(credential.rawId),type:credential.type,response:{clientDataJSON:bytesToB64u(credential.response.clientDataJSON),attestationObject:bytesToB64u(credential.response.attestationObject),transports:credential.response.getTransports?credential.response.getTransports():[]},clientExtensionResults:credential.getClientExtensionResults()};
 const result=await api('registration-verify',response);if(!result.verified)throw new Error('The server could not verify this device authenticator.');return {verified:true,registered:true};
}
async function authenticateKCBiometric(reason='Unlock Kinetic Crew'){
 const options=await api('authentication-options');options.challenge=b64uToBytes(options.challenge);
 options.allowCredentials=(options.allowCredentials||[]).map(x=>({...x,id:b64uToBytes(x.id)}));
 const credential=await navigator.credentials.get({publicKey:options});if(!credential)throw new Error('Device authentication was cancelled.');
 const response={id:credential.id,rawId:bytesToB64u(credential.rawId),type:credential.type,response:{clientDataJSON:bytesToB64u(credential.response.clientDataJSON),authenticatorData:bytesToB64u(credential.response.authenticatorData),signature:bytesToB64u(credential.response.signature),userHandle:credential.response.userHandle?bytesToB64u(credential.response.userHandle):null},clientExtensionResults:credential.getClientExtensionResults()};
 const result=await api('authentication-verify',response);if(!result.verified)throw new Error('The server could not verify your device authentication.');return {verified:true};
}
async function removeKCBiometric(){await api('remove');return {removed:true};}
export {checkKCBiometric,registerKCBiometric,authenticateKCBiometric,removeKCBiometric};