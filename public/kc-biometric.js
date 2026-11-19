const api = () => {
  const client = window.kcSupabase;
  if (!client?.functions?.invoke) throw new Error("Kinetic Crew security service is unavailable. Reload and try again.");
  return client.functions;
};
const bytes = value => {
  const raw = atob(String(value).replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - String(value).length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const base64url = buffer => {
  const data = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < data.length; i++) raw += String.fromCharCode(data[i]);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const optionsForBrowser = options => ({
  ...options,
  challenge: bytes(options.challenge),
  ...(options.user ? { user: { ...options.user, id: bytes(options.user.id) } } : {}),
  ...(options.excludeCredentials ? { excludeCredentials: options.excludeCredentials.map(x => ({ ...x, id: bytes(x.id) })) } : {}),
  ...(options.allowCredentials ? { allowCredentials: options.allowCredentials.map(x => ({ ...x, id: bytes(x.id) })) } : {}),
});
const assertSupported = async () => {
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    throw new Error("This installed app does not support secure passkeys here. Open Kinetic Crew from its installed Chrome app icon and use your mPIN.");
  }
  if (PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) throw new Error("No fingerprint, face or device screen-lock authenticator is available. Set up Android screen lock and retry.");
  }
};
const invoke = async (action, payload = {}) => {
  const { data, error } = await api().invoke("kc-passkeys", { body: { action, ...payload } });
  if (error) throw new Error(data?.error || error.message || "Biometric security request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
};
export async function checkKCBiometric() {
  await assertSupported();
  return { availability: { isAvailable: true } };
}
export async function registerKCBiometric() {
  await assertSupported();
  const { options } = await invoke("register-options");
  const credential = await navigator.credentials.create({ publicKey: optionsForBrowser(options) });
  if (!credential) throw new Error("Biometric registration was cancelled.");
  const response = credential.response;
  const payload = {
    id: credential.id,
    rawId: base64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: base64url(response.clientDataJSON),
      attestationObject: base64url(response.attestationObject),
      transports: response.getTransports ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };
  const result = await invoke("register-verify", { credential: payload });
  if (!result.verified) throw new Error("Your device did not verify biometric registration.");
  return result;
}
export async function authenticateKCBiometric(reason = "Unlock Kinetic Crew") {
  await assertSupported();
  const { options } = await invoke("authentication-options");
  const credential = await navigator.credentials.get({ publicKey: optionsForBrowser(options) });
  if (!credential) throw new Error("Biometric authentication was cancelled.");
  const response = credential.response;
  const payload = {
    id: credential.id,
    rawId: base64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: base64url(response.clientDataJSON),
      authenticatorData: base64url(response.authenticatorData),
      signature: base64url(response.signature),
      userHandle: response.userHandle ? base64url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };
  const result = await invoke("authentication-verify", { credential: payload, reason });
  if (!result.verified) throw new Error("Fingerprint or face authentication could not be verified.");
  return result;
}
export async function removeKCBiometric() {
  return invoke("remove");
}
