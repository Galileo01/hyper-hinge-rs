import assert from "node:assert/strict";
import { browser, $ } from "@wdio/globals";
import { Key } from "webdriverio";
import path from "node:path";

const button = (name) => $(`button[aria-label="${name}"]`);
const invoke = (command, args = {}) =>
  browser.tauri.execute(
    ({ core }, cmd, data) => core.invoke(cmd, data),
    command,
    args,
  );
const text = async (selector) => $(selector).getText();
const until = (fn) => browser.waitUntil(fn, { timeout: 15000, interval: 100 });
const shot = (name) =>
  browser.saveScreenshot(path.resolve(`work/qa/${name}.png`));
async function angle(value) {
  await browser.execute((value) => {
    const input = document.querySelector("#simulation-angle");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  await browser.pause(220);
}
async function home() {
  if (await button("Home").isExisting()) await button("Home").click();
}
async function app(name) {
  await home();
  const launcher = await $(`button.launcher*=${name}`);
  await launcher.click();
  await until(async () => (await text(".app-heading h1")) === name);
}
async function simulate() {
  const toggle = await button("Simulate lid angle");
  if ((await toggle.getAttribute("aria-checked")) !== "true")
    await toggle.click();
}

describe("HyperHinge in macOS WKWebView", () => {
  beforeEach(async () => {
    await browser.execute(async () => {
      await window.__TAURI__.window.getCurrentWindow().setFocus();
    });
    if (await $("dialog[open]").isExisting())
      await $("dialog[open] .close-button").click();
    await home();
    await simulate();
  });
  it("loads the exact shell, real fonts, shared input and native fullscreen", async () => {
    await $(".app-launchers").waitForExist();
    assert.equal(await browser.getTitle(), "HyperHinge");
    assert.equal(await browser.$$(".launcher").length, 5);
    assert.equal(
      await text(".home-heading p"),
      "Did you know there's a hinge sensor in your Macbook?",
    );
    await browser.execute(async () => {
      await document.fonts.ready;
    });
    assert.ok(
      await browser.execute(
        () =>
          document.fonts.check('20px "Ndot 57"') &&
          document.fonts.check("20px Inter"),
      ),
    );
    const frame = await invoke("hinge_snapshot");
    assert.equal(typeof frame.available, "boolean");
    if (process.env.HYPERHINGE_REQUIRE_SENSOR === "1")
      assert.equal(frame.available, true);
    await simulate();
    await angle(108);
    await shot("home");
    await app("Lid Lab");
    await angle(70);
    await until(async () => (await text(".lab-readings")).includes("70"));
    await shot("lid-lab");
    await home();
    assert.match(await text('[data-testid="angle"]'), /70/);
    await button("Enter fullscreen").click();
    await until(async () => await invoke("hinge_fullscreen_state"));
    await browser.keys("Escape");
    await until(async () => !(await invoke("hinge_fullscreen_state")));
    // Fullscreen entered by the native backend must update the shell too.
    await invoke("hinge_fullscreen", { enabled: true });
    await button("Exit fullscreen").waitForExist();
    await button("Exit fullscreen").click();
    await until(async () => !(await invoke("hinge_fullscreen_state")));
  });
  it("freezes missing input, recovers and saves calibration", async () => {
    await invoke("hinge_test_control", { action: "suspend" });
    await button("Simulate lid angle").click();
    await until(async () => (await text(".dock-source")).includes("Offline"));
    await shot("unavailable");
    await simulate();
    await angle(105);
    await until(
      async () =>
        (await text('[data-testid="angle"]')).includes("105") &&
        (await text(".motion-widget .widget-bottom strong")) === "still",
    );
    await invoke("hinge_test_control", { action: "resume" });
    assert.match(await text(".dock-source"), /Simulated/);
    await $(".dock-settings").click();
    await $("button*=Calibrate").click();
    const saved = await browser.execute(() =>
      Number(localStorage.getItem("hyperhinge.reference")),
    );
    assert.ok(Math.abs(saved - 105) < 1);
    // Synthetic WebDriver keys do not perform WKWebView's native dialog cancellation default.
    await browser.execute(() =>
      document
        .querySelector("dialog[open]")
        .dispatchEvent(new Event("cancel", { cancelable: true })),
    );
    assert.equal(await $("dialog[open]").isExisting(), false);
    await $(".dock-settings").click();
    assert.match(await text("dialog"), /105°/);
    await $("dialog[open] .close-button").click();
    await simulate();
  });
  it("animates the monster and preserves fast-loss and slow-win rules", async () => {
    await angle(108);
    await app("Don’t Wake Up");
    await angle(30);
    await until(async () => (await text(".sleep-copy h2")).includes("HELLO"));
    await shot("monster-awake");
    await home();
    await angle(30);
    await app("Don’t Wake Up");
    // Embedded WebDriver clicks <option> programmatically, which does not select it in WKWebView.
    await browser.execute(() => {
      const select = document.querySelector(
        'select[aria-label="Finish angle"]',
      );
      if (select.disabled)
        throw Error("Round already started before choosing a target");
      select.value = "70";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await until(
      async () =>
        (await $('select[aria-label="Finish angle"]').getValue()) === "70",
    );
    await angle(108);
    // The round starts automatically once the lid is sufficiently open.
    const restart = await $("button*=Try again");
    if (await restart.isExisting()) await restart.click();
    for (let value = 108; value >= 68; value -= 1) await angle(value);
    await until(async () => (await text(".sleep-copy h2")).includes("QUIETLY"));
    await shot("monster");
  });
  it("loads source MIDI and gates the score clock with movement", async () => {
    await app("Accordion");
    await browser.execute(() => {
      window.__audioChecks = [];
      window.__audioEvents = [];
      window.addEventListener("blur", () => window.__audioEvents.push("blur"));
      document.addEventListener("visibilitychange", () =>
        window.__audioEvents.push(`hidden=${document.hidden}`),
      );
      const Original = window.AudioContext;
      window.AudioContext = class extends Original {
        createDynamicsCompressor() {
          const compressor = super.createDynamicsCompressor();
          const analyser = this.createAnalyser();
          analyser.fftSize = 1024;
          compressor.connect(analyser);
          window.__audioChecks.push({ analyser, context: this });
          return compressor;
        }
      };
    });
    async function enableSound() {
      await browser.execute(async () => {
        await window.__TAURI__.window.getCurrentWindow().setFocus();
      });
      await until(async () =>
        browser.execute(() => document.hasFocus() && !document.hidden),
      );
      const enable = await $("button=Enable sound");
      if (await enable.isExisting()) {
        await enable.waitForEnabled();
        await enable.click();
      }
    }
    await enableSound();
    await angle(108);
    const position = () => $('input[aria-label="Score position"]').getValue();
    await until(async () => Number(await position()) > 0);
    await browser.pause(1500);
    const stopped = Number(await position());
    await browser.pause(500);
    assert.ok(Math.abs(Number(await position()) - stopped) < 0.05);
    // macOS focus changes stop audio by design; resuming requires another user action.
    await enableSound();
    await angle(55);
    await until(async () => Number(await position()) > stopped + 0.2);
    await until(async () =>
      browser.execute(() =>
        window.__audioChecks.some(({ analyser }) => {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          return samples.some((value) => Math.abs(value) > 0.0001);
        }),
      ),
    );
    await browser.execute(() => document.activeElement?.blur());
    await browser.keys(Key.ArrowUp);
    await until(async () => (await text(".music-note")).includes("Octave +1"));
    await browser.keys(Key.ArrowRight);
    await shot("accordion");
    await browser.execute(() => window.dispatchEvent(new Event("blur")));
    await $("button=Enable sound").waitForExist();
    await home();
    assert.equal(await $(".accordion-app").isExisting(), false);
    await until(async () =>
      browser.execute(() =>
        window.__audioChecks.every(({ context }) => context.state === "closed"),
      ),
    );
  });
  it("reveals the city reversibly and disposes its canvas on route exit", async () => {
    await app("The Other Side");
    await angle(105);
    await until(
      async () =>
        Number(await $(".other-side").getAttribute("data-reveal")) < 0.01,
    );
    await angle(35);
    await until(
      async () =>
        Number(await $(".other-side").getAttribute("data-reveal")) > 0.99,
    );
    assert.equal(await $(".other-fallback").isExisting(), false);
    await shot("other-side");
    await angle(105);
    await until(
      async () =>
        Number(await $(".other-side").getAttribute("data-reveal")) < 0.01,
    );
    await home();
    assert.equal(await $(".other-city canvas").isExisting(), false);
  });
  it("renders the pinball course and respects pause and unavailable input", async () => {
    await angle(105);
    await app("Laptop Pinball");
    assert.equal(await $(".pinball-app canvas").isExisting(), true);
    await shot("pinball");
    await $("button=Start rolling").click();
    await browser.pause(200);
    await $("button=Pause").click();
    const paused = await text(".pinball-readouts");
    await browser.pause(300);
    assert.equal(await text(".pinball-readouts"), paused);
    await angle(85);
    await until(async () =>
      (await text(".pinball-tilt strong")).includes("-13"),
    );
    await shot("pinball-tilted");
    await invoke("hinge_test_control", { action: "suspend" });
    await button("Simulate lid angle").click();
    await until(async () => (await text(".dock-source")).includes("Offline"));
    const frozen = await text(".pinball-readouts");
    await browser.pause(600);
    assert.equal(await text(".pinball-readouts"), frozen);
    await shot("pinball-unavailable");
    await simulate();
    await invoke("hinge_test_control", { action: "resume" });
    await home();
  });
  it("restores the saved reference when the renderer is recreated", async () => {
    // Keep reload last: WKWebView's embedded driver can suspend RAF after a synthetic reload.
    await browser.refresh();
    await $(".app-launchers").waitForExist();
    await $(".dock-settings").click();
    assert.match(await text("dialog"), /Current reference: 105°/);
    await $("dialog[open] .close-button").click();
  });
});
