import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jero009.autoplaner',
  appName: 'Autoplaner',
  webDir: 'dist',
  plugins: {
    // @capacitor-community/sqlite defaults androidIsEncryption to TRUE, which
    // builds a Keystore-backed EncryptedSharedPreferences store during plugin
    // load(). On devices where that store is stale/invalidated the load throws
    // (NPE-style, null message) and the plugin becomes null -> every DB call
    // fails with "CapacitorSQLitePlugin: null". The app never uses plugin-level
    // encryption (databases are plaintext), so disable it entirely.
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
