import { $, $$, browser, expect } from "@wdio/globals";
import type { CodexLimitsResponse } from "../src/lib/api";

describe("quota floating window", () => {
  const run = process.env.CODEX_USAGE_QUOTA_E2E === "1" ? it : it.skip;
  run("shows quota, stays on top, moves independently, and preserves its position when reopened", async () => {
    await browser.tauri.switchWindow("main");
    await browser.execute(() => localStorage.setItem("language", "en"));
    await browser.refresh();
    const open = $("button=Quota overlay");
    await open.waitForDisplayed({ timeout: 90_000 });
    const fixture = await browser.tauri.execute(({ core }) => core.invoke("fetch_codex_limits")) as CodexLimitsResponse;
    await open.click();
    await browser.tauri.switchWindow("quota");
    await $('[data-quota-window="session"]').waitForDisplayed();
    await expect($('[data-quota-window="session"]')).toHaveText(expect.stringContaining("72%"));
    await expect($('[data-quota-window="weekly"]')).toHaveText(expect.stringContaining("35%"));
    const reset = await browser.execute((value) => new Date(value).toLocaleString("en", { hour: "2-digit", minute: "2-digit", hour12: false }), fixture.session!.resetsAt!);
    await expect($('[data-quota-window="session"]')).toHaveText(expect.stringContaining(reset));
    expect(await browser.tauri.execute(async ({ core }) => {
      return {
        visible: await core.invoke("plugin:window|is_visible", { label: "quota" }),
        top: await core.invoke("plugin:window|is_always_on_top", { label: "quota" }),
        decorated: await core.invoke("plugin:window|is_decorated", { label: "quota" }),
      };
    })).toEqual({ visible: true, top: true, decorated: false });
    expect(await $("header[data-tauri-drag-region]").isExisting()).toBe(true);

    // Exercise the native move path and retain the exact position across hide/show.
    const position = await browser.tauri.execute(async ({ core }) => {
      const before = await core.invoke("plugin:window|outer_position", { label: "quota" }) as { x: number; y: number };
      await core.invoke("plugin:window|set_position", { label: "quota", value: { Physical: { x: before.x + 80, y: before.y + 60 } } });
      return { before, after: await core.invoke("plugin:window|outer_position", { label: "quota" }) as { x: number; y: number } };
    });
    expect(position.after.x).toBe(position.before.x + 80);
    expect(position.after.y).toBe(position.before.y + 60);

    await browser.tauri.switchWindow("main");
    await browser.tauri.execute(({ core }) => core.invoke("plugin:window|hide", { label: "main" }));
    await browser.tauri.switchWindow("quota");
    expect(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|is_visible", { label: "quota" }))).toBe(true);
    await $('button[aria-label="Check limits"]').waitForEnabled();
    await browser.tauri.execute(({ core }, payload) => core.invoke("plugin:event|emit", { event: "codex-limits-updated", payload }), { ...fixture, session: { ...fixture.session, remainingPercent: 61 } });
    await expect($('[data-quota-window="session"]')).toHaveText(expect.stringContaining("61%"));
    // Keep a screenshot of the real native WebView for visual inspection.
    if (process.env.CODEX_USAGE_QUOTA_SCREENSHOT) await browser.saveScreenshot(process.env.CODEX_USAGE_QUOTA_SCREENSHOT);

    await $('button[aria-label="Collapse to quota ball"]').click();
    await $('[data-quota-mode="collapsed"]').waitForDisplayed();
    await expect($$('[role="meter"]')).toBeElementsArrayOfSize(1);
    await expect($('[role="meter"]')).toHaveAttribute("aria-valuenow", "61");
    const ballSize = await browser.tauri.execute(async ({ core }) => ({
      size: await core.invoke("plugin:window|inner_size", { label: "quota" }) as { width: number; height: number },
      scale: await core.invoke("plugin:window|scale_factor", { label: "quota" }) as number,
    }));
    expect(ballSize.size.width / ballSize.scale).toBe(88);
    expect(ballSize.size.height / ballSize.scale).toBe(88);
    if (process.env.CODEX_USAGE_QUOTA_SCREENSHOT) await browser.saveScreenshot(process.env.CODEX_USAGE_QUOTA_SCREENSHOT.replace(".png", "-ball.png"));

    if (process.platform === "darwin") {
      await browser.tauri.switchWindow("main");
      await browser.tauri.execute(async ({ core }) => {
        await core.invoke("plugin:window|show", { label: "main" });
        await core.invoke("plugin:window|set_focus", { label: "main" });
        await core.invoke("plugin:window|set_fullscreen", { label: "main", value: true });
      });
      await browser.tauri.switchWindow("quota");
      let stable = 0;
      await browser.waitUntil(async () => {
        const state = await browser.tauri.execute(async ({ core }) => ({
          mainFullScreen: await core.invoke("plugin:window|is_fullscreen", { label: "main" }),
          quota: await core.invoke("quota_native_state") as { fullScreenAuxiliary: boolean; canJoinAllApplications: boolean; onActiveSpace: boolean; visibleOnScreen: boolean },
        }));
        stable = state.mainFullScreen && state.quota.onActiveSpace && state.quota.visibleOnScreen && state.quota.fullScreenAuxiliary && state.quota.canJoinAllApplications ? stable + 1 : 0;
        return stable >= 5;
      }, { timeout: 15_000, interval: 250, timeoutMsg: "Quota ball did not remain on the active full-screen Space" });
    }

    await $('button[aria-label="Expand quota overlay"]').click();
    await $('[data-quota-mode="expanded"]').waitForDisplayed();
    await expect($$('[role="meter"]')).toBeElementsArrayOfSize(2);
    expect(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|is_always_on_top", { label: "quota" }))).toBe(true);
    const expandedSize = await browser.tauri.execute(async ({ core }) => ({
      size: await core.invoke("plugin:window|inner_size", { label: "quota" }) as { width: number; height: number },
      scale: await core.invoke("plugin:window|scale_factor", { label: "quota" }) as number,
    }));
    expect(expandedSize.size.width / expandedSize.scale).toBe(352);
    expect(expandedSize.size.height / expandedSize.scale).toBe(178);
    if (process.platform === "darwin") {
      const native = await browser.tauri.execute(({ core }) => core.invoke("quota_native_state")) as { onActiveSpace: boolean; visibleOnScreen: boolean };
      expect(native.onActiveSpace).toBe(true);
      expect(native.visibleOnScreen).toBe(true);
      await browser.tauri.switchWindow("main");
      await browser.tauri.execute(({ core }) => core.invoke("plugin:window|set_fullscreen", { label: "main", value: false }));
      await browser.waitUntil(async () => !(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|is_fullscreen", { label: "main" }))));
      await browser.tauri.switchWindow("quota");
    }
    await $('button[aria-label="Close"]').click();
    expect(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|is_visible", { label: "quota" }))).toBe(false);
    await browser.tauri.switchWindow("main");
    await browser.tauri.execute(({ core }) => core.invoke("plugin:window|show", { label: "main" }));
    await open.click();
    await browser.tauri.switchWindow("quota");
    expect(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|outer_position", { label: "quota" }))).toEqual(position.after);
    expect(await browser.tauri.execute(({ core }) => core.invoke("plugin:window|is_always_on_top", { label: "quota" }))).toBe(true);
    await expect($('[data-quota-window="session"]')).toHaveText(expect.stringContaining("72%"));
    await $('button[aria-label="Close"]').click();
    await browser.tauri.switchWindow("main");
  }).timeout(180_000);
});
