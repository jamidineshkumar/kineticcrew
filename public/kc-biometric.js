// Native biometric adapter for Capacitor 7. The native plugin is installed
// from package.json and must be synced into the Android/iOS project at build time.
const PLUGIN_URL = 'https://esm.sh/@aparajita/capacitor-biometric-auth@9.1.2?external=@capacitor/core';
let pluginPromise;

export async function getKCBiometricAuth() {
  if (!window.Capacitor?.isNativePlatform?.()) {
    throw new Error('Biometric unlock is available in the installed Android/iOS app, not in a normal browser tab.');
  }
  if (!pluginPromise) {
    pluginPromise = import(PLUGIN_URL).then(module => module.BiometricAuth);
  }
  return pluginPromise;
}

export async function checkKCBiometric() {
  const auth = await getKCBiometricAuth();
  const availability = await auth.checkBiometry();
  return { auth, availability };
}

export async function authenticateKCBiometric(reason = 'Unlock Kinetic Crew') {
  const auth = await getKCBiometricAuth();
  const availability = await auth.checkBiometry();
  if (!availability.isAvailable) {
    throw new Error(availability.reason || 'No app-usable fingerprint or face authentication is enrolled on this device.');
  }
  await auth.authenticate({
    reason,
    cancelTitle: 'Use mPIN',
    allowDeviceCredential: false,
    androidTitle: 'Kinetic Crew',
    androidSubtitle: reason,
    androidConfirmationRequired: false,
    androidBiometryStrength: 0
  });
  return availability;
}
