import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kineticcrew.hq',
  appName: 'Kinetic Crew',
  webDir: 'public',
  bundledWebRuntime: false,
  backgroundColor: '#0b0d13',
  ios: {
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
