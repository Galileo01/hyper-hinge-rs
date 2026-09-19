import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
mkdirSync("work/qa/browser", { recursive: true });
const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();
try {
  for (const [name, engine] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:5173");
      await page.locator(".launcher").first().waitFor();
      assert.equal(await page.locator(".launcher").count(), 5);
      for (const width of [320, 375, 414, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 800 ? 900 : 960 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: `work/qa/browser/${name}-home-${width}.png`,
        });
        for (const app of [
          "Lid Lab",
          "Don’t Wake Up",
          "Accordion",
          "The Other Side",
          "Laptop Pinball",
        ]) {
          await page
            .locator(".launcher", { has: page.getByText(app, { exact: true }) })
            .click();
          await page.locator(".app-heading").waitFor();
          await page.waitForTimeout(150);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${name}: ${app} at ${width}`,
          );
          await page.screenshot({
            path: `work/qa/browser/${name}-${app.replaceAll(" ", "-")}-${width}.png`,
          });
          await page.getByRole("button", { name: "Home", exact: true }).click();
        }
      }
      assert.deepEqual(errors, []);
      console.log(
        `${name}: all five apps at 320/375/414/768/1440px passed without page errors`,
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
