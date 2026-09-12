import path from "node:path";
export const config = {
  runner: "local",
  specs: [path.resolve("tests/desktop.e2e.mjs")],
  maxInstances: 1,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { timeout: 180000 },
  waitforTimeout: 15000,
  connectionRetryTimeout: 30000,
  connectionRetryCount: 0,
  outputDir: path.resolve("work/qa/logs"),
  before: async () => {
    await browser.waitUntil(
      async () =>
        browser.execute(() =>
          Boolean(
            document.querySelector(".app-launchers") &&
            window.__wdio_original_core__,
          ),
        ),
      { timeout: 30000, interval: 200 },
    );
  },
  afterTest: async (_test, _context, { passed }) => {
    if (!passed) {
      console.log(
        "Page diagnostics:",
        await browser.execute(() => ({
          url: location.href,
          html: document.body.innerHTML.slice(0, 2000),
          hidden: document.hidden,
          focused: document.hasFocus(),
          audioEvents: window.__audioEvents,
          tauri: !!window.__TAURI__,
          wdio: !!window.__wdio_original_core__,
        })),
      );
      await browser.saveScreenshot(path.resolve("work/qa/desktop-failure.png"));
    }
  },
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: path.resolve(
          "src-tauri/target/aarch64-apple-darwin/debug/hyper-hinge",
        ),
        driverProvider: "embedded",
        captureBackendLogs: true,
        captureFrontendLogs: true,
        logDir: path.resolve("work/qa/logs"),
      },
    ],
  ],
  capabilities: [{ browserName: "tauri", "tauri:options": {} }],
};
