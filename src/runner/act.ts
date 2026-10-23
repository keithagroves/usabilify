// Performing a persona's action within its input constraints.
import type { Page } from "playwright";
import type { Action, Persona } from "../types.js";
import { focusedInfo, targetAt } from "./perceive.js";

const KEYS = new Set(["Tab", "Shift+Tab", "Enter", "Space", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Backspace"]);

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export interface ActResult { events: string[]; target?: any; misclick?: { from: [number, number]; to: [number, number]; intended?: string } }

/** Which action types each modality may use. Anything else is refused and the persona is told. */
export const ALLOWED: Record<Persona["modality"], Action["type"][]> = {
  sighted: ["click", "type", "press", "scroll", "select", "back", "wait", "done", "give_up"],
  keyboard: ["press", "type", "select", "wait", "done", "give_up"],
  "screen-reader": ["activate", "fill", "select", "press", "back", "wait", "done", "give_up"],
};

export async function perform(page: Page, persona: Persona, act: Action): Promise<ActResult> {
  const events: string[] = [];
  if (!ALLOWED[persona.modality].includes(act.type)) return { events: [`refused:${act.type} is not something you can do`] };
  const vp = page.viewportSize()!;
  switch (act.type) {
    case "click": {
      const mc = persona.input.misclick;
      let x = act.x + gauss() * mc.sigmaPx, y = act.y + gauss() * mc.sigmaPx;
      if (Math.random() < mc.p) { const a = Math.random() * 2 * Math.PI, d = 18 + Math.random() * 14; x += Math.cos(a) * d; y += Math.sin(a) * d; }
      x = Math.max(0, Math.min(vp.width - 1, Math.round(x))); y = Math.max(0, Math.min(vp.height - 1, Math.round(y)));
      const intended = await targetAt(page, act.x, act.y);
      const target = await targetAt(page, x, y);
      const missed = !!intended && !!target && intended.selector !== target.selector;
      await page.mouse.move(x, y, { steps: 4 });
      if (target?.isSelect) {
        // Native dropdowns don't render in screenshots: describe the open list instead.
        await page.mouse.click(x, y).catch(() => {});
        await page.keyboard.press("Escape").catch(() => {});
        events.push(`dropdown-open:${target.options.join(" / ")}`);
      } else await page.mouse.click(x, y);
      return { events: missed ? [...events, "misclick"] : events, target, misclick: missed ? { from: [act.x, act.y], to: [x, y], intended: `${intended!.role} "${intended!.text.replace(/\s+/g, " ").slice(0, 40)}"` } : undefined };
    }
    case "type": {
      if (act.replace) await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(act.text, { delay: 25 });
      const f = await focusedInfo(page);
      if (!f || !["input", "textarea"].includes(f.tag)) events.push("typed-into-nothing");
      return { events };
    }
    case "press": {
      const key = act.key.replace(/^Shift\s*\+\s*Tab$/i, "Shift+Tab").replace(/^space$/i, "Space").replace(/^esc$/i, "Escape").replace(/^return$/i, "Enter");
      if (!KEYS.has(key)) return { events: [`refused:key ${act.key}`] };
      await page.keyboard.press(key);
      const f = await focusedInfo(page);
      if (persona.modality === "keyboard" && key.includes("Tab")) events.push(`focus:${f ? `${f.tag} "${f.name}"` : "page"}`);
      if (f?.isSelect) events.push(`dropdown-focused:${f.options.join(" / ")}`);
      return { events };
    }
    case "scroll": await page.mouse.wheel(0, act.dy); return { events };
    case "back": await page.goBack().catch(() => {}); return { events: ["back"] };
    case "wait": await page.waitForTimeout(1500); return { events };
    case "activate": {
      const loc = page.locator(`[data-usab-ref="${act.ref}"]`);
      if (!(await loc.count())) return { events: [`refused:no item ${act.ref}`] };
      // Read the accessible name before acting: activation may re-render the page.
      const info = await loc.evaluate((e: any) => ({ tag: e.tagName, name: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60), focusable: e.tabIndex >= 0 }));
      await loc.focus();
      if (info.tag === "INPUT" || info.tag === "TEXTAREA" || info.tag === "SELECT") return { events: ["focused-field"] };
      await loc.press("Enter");
      return { events, target: { selector: `ref ${act.ref}`, text: info.name, role: info.tag.toLowerCase(), focusable: info.focusable } };
    }
    case "fill": {
      const loc = page.locator(`[data-usab-ref="${act.ref}"]`);
      if (!(await loc.count())) return { events: [`refused:no item ${act.ref}`] };
      await loc.fill(act.text);
      return { events };
    }
    case "select": {
      let loc;
      if (act.ref != null) loc = page.locator(`[data-usab-ref="${act.ref}"]`);
      else if (act.x != null && act.y != null) {
        const h = await page.evaluateHandle(`document.elementFromPoint(${act.x}, ${act.y})?.closest('select')`);
        const el = h.asElement();
        if (!el) return { events: ["refused:no dropdown there"] };
        await (el as any).selectOption({ label: act.option }).catch(async () => (el as any).selectOption(act.option));
        return { events: [`selected:${act.option}`] };
      } else loc = page.locator("select:focus");
      if (!(await loc.count())) return { events: ["refused:no dropdown focused"] };
      await loc.selectOption({ label: act.option }).catch(() => loc.selectOption(act.option));
      return { events: [`selected:${act.option}`] };
    }
    case "done": case "give_up": return { events };
  }
}
