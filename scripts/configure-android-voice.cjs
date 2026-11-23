const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const packageDir = path.join(root, "android/app/src/main/java/com/kineticcrew/hq");
const pluginSource = path.join(root, "native/android/KcVoicePlugin.java");
const pluginTarget = path.join(packageDir, "KcVoicePlugin.java");
const activityPath = path.join(packageDir, "MainActivity.java");
const manifestPath = path.join(root, "android/app/src/main/AndroidManifest.xml");

if (!fs.existsSync(pluginSource) || !fs.existsSync(activityPath) || !fs.existsSync(manifestPath)) {
  throw new Error("Generated Capacitor Android project is missing expected app files.");
}
fs.mkdirSync(packageDir, { recursive: true });
fs.copyFileSync(pluginSource, pluginTarget);

let activity = fs.readFileSync(activityPath, "utf8");
if (!activity.includes("registerPlugin(KcVoicePlugin.class)")) {
  activity = activity.replace(
    /public class MainActivity extends BridgeActivity\s*\{/,
    "public class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(KcVoicePlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n"
  );
  if (!activity.includes("registerPlugin(KcVoicePlugin.class)")) {
    throw new Error("Could not safely register KcVoicePlugin in MainActivity.");
  }
  fs.writeFileSync(activityPath, activity);
}

let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes('android.permission.RECORD_AUDIO')) {
  manifest = manifest.replace(
    /<manifest\b[^>]*>/,
    (tag) => tag + '\n    <uses-permission android:name="android.permission.RECORD_AUDIO" />'
  );
  fs.writeFileSync(manifestPath, manifest);
}
console.log("KC Voice native Android speech recognition plugin configured.");
