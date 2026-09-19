import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
execFileSync(
  "npx",
  [
    "--no-install",
    "tauri",
    "build",
    "--target",
    "aarch64-apple-darwin",
    "--bundles",
    "app",
  ],
  { stdio: "inherit", env: { ...process.env, VITE_DESKTOP_TEST: "0" } },
);
mkdirSync("release", { recursive: true });
rmSync("release/HyperHinge.app", { recursive: true, force: true });
cpSync(
  "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/HyperHinge.app",
  "release/HyperHinge.app",
  { recursive: true },
);
console.log("Local unsigned/unnotarized app: release/HyperHinge.app");
