import { spawn, execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
const app = path.resolve("release/HyperHinge.app");
const binary = path.join(app, "Contents/MacOS/hyper-hinge");
const helper = path.join(app, "Contents/MacOS/lid-sensor");
for (const file of [binary, helper]) {
  accessSync(file, constants.X_OK);
  assert.match(execFileSync("file", [file], { encoding: "utf8" }), /arm64/);
}
const plist = execFileSync(
  "plutil",
  ["-convert", "json", "-o", "-", path.join(app, "Contents/Info.plist")],
  { encoding: "utf8" },
);
assert.equal(JSON.parse(plist).CFBundleIdentifier, "com.hyperhinge.desktop");
// Rust plugins leave identifiable strings in an instrumented binary. Reject that artifact.
const strings = execFileSync("strings", [binary], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert.ok(
  !strings.includes("TAURI_WEBDRIVER_PORT"),
  "Release must exclude embedded WebDriver",
);
assert.ok(
  !strings.includes("hinge_test_control"),
  "Release must exclude test IPC",
);
let sensor;
try {
  sensor = JSON.parse(
    execFileSync(helper, ["--once"], { encoding: "utf8", timeout: 5000 }),
  );
} catch (error) {
  if (process.env.HYPERHINGE_REQUIRE_SENSOR === "1") throw error;
  sensor = {
    available: false,
    reason: "No supported sensor; live acceptance remains pending",
  };
}
const processRef = spawn(binary, [], { stdio: ["ignore", "pipe", "pipe"] });
let errors = "";
let launchError;
processRef.on("error", (error) => {
  launchError = error;
});
processRef.stderr.on("data", (bytes) => {
  errors += bytes;
});
try {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  assert.equal(launchError, undefined);
  assert.equal(processRef.exitCode, null, errors);
  console.log(
    JSON.stringify(
      {
        app,
        sensor,
        launch: "running",
        rendererAcceptance:
          "Requires real app UI inspection; process liveness is not a renderer assertion",
      },
      null,
      2,
    ),
  );
} finally {
  if (
    processRef.exitCode === null &&
    processRef.signalCode === null &&
    !launchError
  ) {
    const exited = new Promise((resolve) => processRef.once("exit", resolve));
    const timeout = setTimeout(() => processRef.kill("SIGKILL"), 5000);
    processRef.kill("SIGTERM");
    await exited;
    clearTimeout(timeout);
    assert.notEqual(
      processRef.signalCode,
      "SIGKILL",
      "Application must shut down gracefully",
    );
  }
}
