import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
// The test-only feature embeds WebDriver. Never copy this binary to release/.
execFileSync(
  "npx",
  [
    "--no-install",
    "tauri",
    "build",
    "--target",
    "aarch64-apple-darwin",
    "--debug",
    "--no-bundle",
    "--features",
    "desktop-test",
    "--config",
    JSON.stringify({
      build: { frontendDist: "../work/desktop-dist" },
      app: { withGlobalTauri: true },
    }),
  ],
  { stdio: "inherit", env: { ...process.env, VITE_DESKTOP_TEST: "1" } },
);
mkdirSync("work/qa", { recursive: true });
execFileSync("npx", ["--no-install", "wdio", "run", "scripts/wdio.conf.mjs"], {
  stdio: "inherit",
});
