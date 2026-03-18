const { test, expect } = require("@playwright/test");

test("game boots, starts, and core controls respond", async ({ page }) => {
  const runtimeErrors = [];

  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      runtimeErrors.push(`console.error: ${msg.text()}`);
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "The Bowler" })).toBeVisible();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#overlay")).toBeVisible();

  // First click starts the game and also unlocks audio context if allowed.
  await page.click("#overlay");
  await expect(page.locator("#overlay")).toHaveClass(/hidden/);

  await expect(page.locator("#music-toggle")).toHaveText("Music: On");
  await page.click("#music-toggle");
  await expect(page.locator("#music-toggle")).toHaveText("Music: Off");
  await page.click("#music-toggle");
  await expect(page.locator("#music-toggle")).toHaveText("Music: On");

  // Let the game loop run and enemy spawning kick in.
  await page.waitForTimeout(1800);

  const hud = await page.evaluate(() => {
    const score = Number(document.getElementById("score")?.textContent || "0");
    const best = Number(document.getElementById("best")?.textContent || "0");
    const overlayHidden = document
      .getElementById("overlay")
      ?.classList.contains("hidden");
    return { score, best, overlayHidden };
  });

  expect(Number.isFinite(hud.score)).toBeTruthy();
  expect(Number.isFinite(hud.best)).toBeTruthy();
  expect(hud.overlayHidden).toBeTruthy();
  expect(runtimeErrors).toEqual([]);
});
