const { spawn } = require("node:child_process");
const expoCommand = process.platform === "win32" ? "expo.cmd" : "expo";
const expoArgs = ["run:android", "--device", ...process.argv.slice(2)];

// The connected OnePlus uses arm64-v8a. Limiting development builds to that ABI
// avoids the current x86-only native-link failure in react-native-filament.
const child = spawn(expoCommand, expoArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ORG_GRADLE_PROJECT_reactNativeArchitectures: "arm64-v8a",
  },
});

child.once("error", (error) => {
  console.error("Could not start the Android phone build:", error.message);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
