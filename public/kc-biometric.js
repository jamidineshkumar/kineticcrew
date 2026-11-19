const nativeRuntime = () =>
  !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.getPlatform?.() === "ios");

async function nativeBiometricModule() {
  if (!nativeRuntime()) {
    throw new Error("Native fingerprint and face unlock are available in the installed Android/iOS app, not in the browser PWA.");
  }
  // The plugin is registered by Capacitor during the Android build. The ESM bundle
  // shares Capacitor's native bridge and calls AndroidX BiometricPrompt directly.
  const { BiometricAuth, AndroidBiometryStrength } =
    await import("https://esm.sh/@aparajita/capacitor-biometric-auth@9.1.2?bundle");
  return { BiometricAuth, AndroidBiometryStrength };
}

export async function checkKCBiometric() {
  const { BiometricAuth } = await nativeBiometricModule();
  const result = await BiometricAuth.checkBiometry();
  return {
    native: true,
    availability: {
      isAvailable: !!result.isAvailable,
      strongBiometryIsAvailable: !!result.strongBiometryIsAvailable,
      deviceIsSecure: !!result.deviceIsSecure,
      reason: result.reason || result.strongReason || "",
      code: result.code || "",
      biometryType: result.biometryType,
    },
  };
}

export async function registerKCBiometric() {
  // There is no in-app enrolment: Android owns biometric enrolment in system settings.
  // This method only checks that an enrolled biometric is available to this app.
  const status = await checkKCBiometric();
  if (!status.availability.isAvailable) {
    throw new Error(status.availability.reason || "No enrolled fingerprint or face authenticator is available to apps on this device.");
  }
  return status;
}

export async function authenticateKCBiometric(reason = "Unlock Kinetic Crew") {
  const { BiometricAuth, AndroidBiometryStrength } = await nativeBiometricModule();
  const status = await BiometricAuth.checkBiometry();
  if (!status.isAvailable) {
    throw new Error(status.reason || "No enrolled fingerprint or face authenticator is available to apps. Check Android Settings → Security.");
  }
  await BiometricAuth.authenticate({
    reason,
    cancelTitle: "Use mPIN",
    allowDeviceCredential: false,
    androidTitle: "Kinetic Crew",
    androidSubtitle: reason,
    androidConfirmationRequired: false,
    androidBiometryStrength: AndroidBiometryStrength.weak,
  });
  return { verified: true };
}

export async function removeKCBiometric() {
  // Biometrics are owned by Android; there is no app-side credential to delete.
  return { removed: true };
}
