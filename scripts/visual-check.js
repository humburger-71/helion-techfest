"use strict";

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const baseUrl = process.env.HELION_TEST_URL || "http://127.0.0.1:3000";
const outputDirectory = join(__dirname, "..", "artifacts");
mkdirSync(outputDirectory, { recursive: true });

function monitorPage(page, errors, failedRequests) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || "failed"}`);
  });
}

async function load(page) {
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
  if (!response?.ok()) throw new Error(`Site returned ${response?.status()}`);
  await page.waitForTimeout(1_400);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  });
  const errors = [];
  const failedRequests = [];
  const result = {};

  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await desktop.newPage();
    monitorPage(page, errors, failedRequests);
    await load(page);

    result.desktop = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector("h1")?.textContent.trim(),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      sections: document.querySelectorAll("main section").length,
      interestCtas: document.querySelectorAll("[data-interest-open]").length
    }));
    const heroInterestButton = page.getByRole("button", { name: /get early access/i });
    await heroInterestButton.hover();
    await page.waitForTimeout(650);
    result.buttonHover = await heroInterestButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        beforeContent: getComputedStyle(element, "::before").content
      };
    });
    await page.screenshot({ path: join(outputDirectory, "desktop-button-hover.png") });

    await page.locator(".transition-field").scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
    result.continuityWord = await page.locator(".continuity-word").evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return { color: style.color, stroke: style.webkitTextStrokeColor, width: bounds.width, visibility: style.visibility };
    });
    await page.screenshot({ path: join(outputDirectory, "desktop-continuity.png") });
    await page.locator("#top").scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outputDirectory, "desktop-home.png") });

    await heroInterestButton.click();
    await page.waitForTimeout(850);
    await page.screenshot({ path: join(outputDirectory, "desktop-form.png") });
    await page.getByRole("button", { name: /submit interest/i }).click();
    result.invalidErrors = {
      name: await page.locator('[data-error-for="name"]').textContent(),
      email: await page.locator('[data-error-for="email"]').textContent(),
      consent: await page.locator('[data-error-for="consent"]').textContent()
    };

    const email = `visual-${Date.now()}@example.com`;
    await page.locator('input[name="name"]').fill("Visual QA Student");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("+91 98765 43210");
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: /submit interest/i }).click();
    await page.getByText("You're on the list.", { exact: false }).waitFor({ state: "visible" });
    result.referenceId = await page.locator("#interest-reference").textContent();
    const verificationDatabase = new DatabaseSync(join(__dirname, "..", "data", "helion.sqlite"), { readOnly: true });
    const persisted = verificationDatabase.prepare("SELECT status, discount_active, discount_used, registration_status FROM interests WHERE interest_id = ?").get(result.referenceId);
    verificationDatabase.close();
    result.persistedRecord = persisted;
    await page.waitForTimeout(750);
    await page.screenshot({ path: join(outputDirectory, "desktop-success.png") });

    await page.getByRole("button", { name: /return to helion/i }).click();
    await page.getByRole("button", { name: /^Interested/i }).first().click();
    await page.locator('input[name="name"]').fill("Duplicate Student");
    await page.locator('input[name="email"]').fill(email.toUpperCase());
    await page.locator('input[name="consent"]').check();
    await page.getByRole("button", { name: /submit interest/i }).click();
    await page.getByText(/already on the HELION early-interest list/i).waitFor({ state: "visible" });
    result.duplicateMessage = await page.locator("#form-error").textContent();
    await page.getByRole("button", { name: /close interest form/i }).click();

    await page.locator("#details").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_250);
    result.aboutRevealVisible = await page.locator("#details .reveal-mask").evaluate((element) => element.classList.contains("visible"));
    result.dawnWord = await page.locator("#details .section-ghost").evaluate((element) => ({
      color: getComputedStyle(element).color,
      stroke: getComputedStyle(element).webkitTextStrokeColor,
      text: element.textContent.trim()
    }));
    await page.screenshot({ path: join(outputDirectory, "desktop-about.png") });
    await page.locator("#in-the-works").scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_250);
    result.statusRevealVisible = await page.locator("#in-the-works .reveal-mask").evaluate((element) => element.classList.contains("visible"));
    result.progressWord = await page.locator("#in-the-works .section-ghost").evaluate((element) => ({
      color: getComputedStyle(element).color,
      stroke: getComputedStyle(element).webkitTextStrokeColor,
      text: element.textContent.trim()
    }));
    await page.screenshot({ path: join(outputDirectory, "desktop-status.png") });
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const mobilePage = await mobile.newPage();
    monitorPage(mobilePage, errors, failedRequests);
    await load(mobilePage);
    result.mobile = await mobilePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      navHeight: document.querySelector("#nav-inner")?.getBoundingClientRect().height,
      heroHeight: document.querySelector("#top")?.getBoundingClientRect().height
    }));
    await mobilePage.screenshot({ path: join(outputDirectory, "mobile-home.png") });
    await mobilePage.getByRole("button", { name: /^Interested/i }).click();
    await mobilePage.locator("#interest-dialog").waitFor({ state: "visible" });
    await mobilePage.waitForTimeout(850);
    result.mobileDialog = await mobilePage.locator(".interest-shell").evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      viewportHeight: window.innerHeight
    }));
    await mobilePage.screenshot({ path: join(outputDirectory, "mobile-form.png") });
    await mobile.close();

    const reduced = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const reducedPage = await reduced.newPage();
    monitorPage(reducedPage, errors, failedRequests);
    await load(reducedPage);
    result.reducedMotion = await reducedPage.evaluate(() => ({
      matches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      heroAnimationDuration: getComputedStyle(document.querySelector(".startup-hero-title")).animationDuration,
      revealOpacity: getComputedStyle(document.querySelector(".reveal")).opacity,
      scrollTransform: getComputedStyle(document.querySelector(".scroll-motion")).transform,
      cursorDisplay: getComputedStyle(document.querySelector("#cursor-field")).display
    }));
    await reduced.close();

    result.consoleErrors = errors;
    result.failedRequests = [...new Set(failedRequests)];
    console.log(JSON.stringify(result, null, 2));

    if (result.desktop.scrollWidth > result.desktop.viewportWidth) throw new Error("Desktop has horizontal overflow");
    if (result.mobile.scrollWidth > result.mobile.viewportWidth) throw new Error("Mobile has horizontal overflow");
    if (!result.aboutRevealVisible || !result.statusRevealVisible) throw new Error("Section reveals did not complete");
    if (result.buttonHover.beforeContent !== "none") throw new Error("Primary button hover still has a foreground pseudo-element");
    if (!result.buttonHover.boxShadow.includes("255, 179, 71")) throw new Error("Primary button hover fill did not settle to amber");
    if (result.continuityWord.visibility !== "visible" || result.continuityWord.width <= 0) throw new Error("Continuity word is not visibly rendered");
    if (result.dawnWord.text !== "DAWN" || result.progressWord.text !== "IN PROGRESS") throw new Error("Scroll-linked background words are missing");
    if (errors.length) throw new Error(`Browser console errors detected: ${errors.join(" | ")}`);
    const localFailures = failedRequests.filter((entry) => entry.includes(baseUrl));
    if (localFailures.length) throw new Error(`Local request failures detected: ${localFailures.join(" | ")}`);
  } finally {
    await browser.close();
    const cleanupDatabase = new DatabaseSync(join(__dirname, "..", "data", "helion.sqlite"));
    cleanupDatabase.prepare("DELETE FROM interests WHERE email_normalized LIKE 'visual-%@example.com'").run();
    cleanupDatabase.close();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
