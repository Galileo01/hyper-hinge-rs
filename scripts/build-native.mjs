import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
if (process.platform !== "darwin") {
  console.log("macOS sensor unavailable; simulation remains usable.");
  process.exit(0);
}
mkdirSync("bin", { recursive: true });
mkdirSync("src-tauri/binaries", { recursive: true });
execFileSync(
  "xcrun",
  [
    "clang",
    "-O2",
    "-arch",
    "arm64",
    "-mmacosx-version-min=12.0",
    "-Wall",
    "-Wextra",
    "native/lid-sensor.c",
    "-framework",
    "IOKit",
    "-framework",
    "CoreFoundation",
    "-o",
    "bin/lid-sensor",
  ],
  { stdio: "inherit" },
);

copyFileSync(
  "bin/lid-sensor",
  "src-tauri/binaries/lid-sensor-aarch64-apple-darwin",
);
