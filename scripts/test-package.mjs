import { spawn, execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
const app = path.resolve("release/HyperHinge.app");
const binary = path.join(app, "Contents/MacOS/hyper-hinge");
assert.deepEqual(readdirSync(path.join(app, "Contents/MacOS")).sort(), [
  "hyper-hinge",
]);
for (const file of [binary]) {
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
    execFileSync(binary, ["--sensor-worker", "--once"], {
      encoding: "utf8",
      timeout: 5000,
      killSignal: "SIGKILL",
    }),
  );
} catch (error) {
  if (process.env.HYPERHINGE_REQUIRE_SENSOR === "1") throw error;
  sensor = {
    available: false,
    reason: "No supported sensor; live acceptance remains pending",
  };
}
if (typeof sensor.angle === "number") {
  assert.ok(
    Number.isFinite(sensor.angle) && sensor.angle >= 0 && sensor.angle <= 180,
  );
  // Verify that worker mode streams/flushed output and exits on SIGTERM without
  // constructing the desktop application or requiring a window close.
  const worker = spawn(binary, ["--sensor-worker"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let samples = 0;
  let pending = "";
  let failure;
  let requestedStop = false;
  const timeout = setTimeout(() => {
    failure = new Error("Sensor stream did not finish within 5 seconds");
    worker.kill("SIGKILL");
  }, 5000);
  worker.stdout.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop();
    try {
      for (const line of lines) {
        const frame = JSON.parse(line);
        assert.ok(
          Number.isFinite(frame.angle) &&
            frame.angle >= 0 &&
            frame.angle <= 180,
        );
        samples++;
      }
      if (samples >= 3 && !requestedStop) {
        requestedStop = true;
        worker.kill("SIGTERM");
      }
    } catch (error) {
      failure = error;
      worker.kill("SIGKILL");
    }
  });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once("error", reject);
      worker.once("exit", (code, signal) => resolve({ code, signal }));
    });
    if (failure) throw failure;
    assert.ok(samples >= 3);
    assert.deepEqual(result, { code: 0, signal: null });
  } finally {
    clearTimeout(timeout);
    if (worker.exitCode === null && worker.signalCode === null)
      worker.kill("SIGKILL");
  }
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
