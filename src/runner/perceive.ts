// What the persona can perceive: screenshots, transient messages, and a screen reader's virtual buffer.
import type { Page } from "playwright";
import { sha } from "../util.js";

/** Injected into every page: counts DOM mutations and logs transient status/alert messages. */
export const INIT_SCRIPT = `(() => {
  const u = (window.__usab = { mutations: 0, transients: [] });
  const seen = new WeakSet();
  const check = () => {
    document.querySelectorAll('[role=status],[role=alert],[aria-live]').forEach((el) => {
      const txt = (el.textContent || '').trim();
      const vis = txt && !el.hidden && el.getClientRects().length > 0;
      if (vis && el.__usabLast !== txt) { el.__usabLast = txt; u.transients.push({ t: performance.now(), text: txt }); }
      if (!vis) el.__usabLast = '';
    });
  };
  new MutationObserver((ms) => { u.mutations += ms.length; check(); })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
})();`;

export async function screenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ scale: "css", animations: "disabled", caret: "initial" });
}

export async function mutationCount(page: Page): Promise<number> {
  return page.evaluate("window.__usab ? window.__usab.mutations : 0").catch(() => 0) as Promise<number>;
}

export async function transientsSince(page: Page, since: number): Promise<{ t: number; text: string }[]> {
  return page.evaluate(`(window.__usab?.transients || []).filter(x => x.t >= ${since})`).catch(() => []) as Promise<any>;
}
export const pageNow = (page: Page) => page.evaluate("performance.now()").catch(() => 0) as Promise<number>;

/** Text of any status or alert message currently visible. */
export async function visibleTransient(page: Page): Promise<string> {
  return page.evaluate(`[...document.querySelectorAll('[role=status],[role=alert]')].filter(e => !e.hidden && e.getClientRects().length).map(e => e.textContent.trim()).filter(Boolean).join(' | ')`).catch(() => "") as Promise<string>;
}

/**
 * Watch the page for `ms` after an action, the way a person's eyes come back to the screen.
 * Returns frames where a transient message was visible, so the replay (and maybe the persona) can show it.
 */
export async function settle(page: Page, ms: number): Promise<{ glimpses: { t: number; png: Buffer; note: string }[]; slowMs: number }> {
  const t0 = Date.now();
  await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  const slowMs = Date.now() - t0;
  const glimpses: { t: number; png: Buffer; note: string }[] = [];
  let last = "";
  while (Date.now() - t0 < Math.max(ms, slowMs)) {
    const tr = await visibleTransient(page);
    if (tr && tr !== last) glimpses.push({ t: Date.now() - t0, png: await screenshot(page), note: tr });
    last = tr;
    await page.waitForTimeout(150);
  }
  return { glimpses, slowMs };
}

export const frameHash = (png: Buffer) => sha(png, 16);

/** What sits under a point: the nearest interactive ancestor, for the analyst (never shown to the persona). */
export async function targetAt(page: Page, x: number, y: number) {
  return page.evaluate(`(() => {
    let el = document.elementFromPoint(${x}, ${y});
    if (!el) return null;
    const hit = el.closest('a,button,input,select,textarea,[role],[onclick],[tabindex]') || el;
    const sel = (e) => e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
    return {
      selector: sel(hit),
      text: (hit.getAttribute('aria-label') || hit.textContent || hit.value || '').trim().slice(0, 80),
      role: hit.getAttribute('role') || hit.tagName.toLowerCase(),
      focusable: hit.tabIndex >= 0,
      isSelect: hit.tagName === 'SELECT',
      options: hit.tagName === 'SELECT' ? [...hit.options].map(o => o.text) : [],
    };
  })()`).catch(() => null) as Promise<{ selector: string; text: string; role: string; focusable: boolean; isSelect: boolean; options: string[] } | null>;
}

export async function focusedInfo(page: Page) {
  return page.evaluate(`(() => { const e = document.activeElement; if (!e || e === document.body) return null;
    return { tag: e.tagName.toLowerCase(), name: (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || '').trim().slice(0, 60), isSelect: e.tagName === 'SELECT', options: e.tagName === 'SELECT' ? [...e.options].map(o => o.text) : [] }; })()`).catch(() => null) as Promise<{ tag: string; name: string; isSelect: boolean; options: string[] } | null>;
}

/**
 * A screen reader's virtual buffer: the page as a linear list of what would be announced.
 * Interactive items get [n] refs (and data-usab-ref) so the persona can act on them.
 * A div with a click handler and no role is announced as plain text, as a real screen reader would.
 */
export async function virtualBuffer(page: Page): Promise<string> {
  return page.evaluate(`(() => {
    document.querySelectorAll('[data-usab-ref]').forEach(e => e.removeAttribute('data-usab-ref'));
    const out = []; let n = 0;
    const hidden = (e) => e.hidden || e.getAttribute('aria-hidden') === 'true' || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden';
    const name = (e) => {
      if (e.getAttribute('aria-label')) return e.getAttribute('aria-label');
      if (e.getAttribute('aria-labelledby')) return e.getAttribute('aria-labelledby').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      if (e.labels && e.labels.length) return e.labels[0].textContent.trim();
      return (e.textContent || '').trim().replace(/\\s+/g, ' ');
    };
    const ref = (e) => { n++; e.setAttribute('data-usab-ref', n); return '[' + n + '] '; };
    const LAND = { HEADER: 'banner', NAV: 'navigation', MAIN: 'main', FOOTER: 'contentinfo' };
    const walk = (e) => {
      if (e.nodeType === 3) { const t = e.textContent.trim().replace(/\\s+/g, ' '); if (t) out.push(t); return; }
      if (e.nodeType !== 1 || hidden(e)) return;
      const tag = e.tagName, role = e.getAttribute('role');
      if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(tag)) return;
      if (/^H[1-6]$/.test(tag)) { out.push('heading level ' + tag[1] + ', ' + name(e)); return; }
      if (tag === 'A' && e.hasAttribute('href')) { out.push(ref(e) + 'link, ' + name(e)); return; }
      if (tag === 'BUTTON' || role === 'button') {
        const pr = e.getAttribute('aria-pressed');
        out.push(ref(e) + (pr ? 'toggle button, ' : 'button, ') + name(e) + (pr ? (pr === 'true' ? ', pressed' : ', not pressed') : ''));
        return;
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA') { out.push(ref(e) + 'edit text, ' + name(e) + (e.value ? ', ' + e.value : ', blank')); return; }
      if (tag === 'SELECT') { out.push(ref(e) + 'combo box, ' + name(e) + ', ' + (e.selectedOptions[0]?.text || '') + ' (options: ' + [...e.options].map(o => o.text).join(', ') + ')'); return; }
      if (tag === 'TABLE') {
        const rows = [...e.rows].map(r => [...r.cells].map(c => c.textContent.trim()).join(' | '));
        out.push('table with ' + e.rows.length + ' rows'); rows.forEach(r => out.push('  ' + r)); out.push('end of table'); return;
      }
      const land = role === 'dialog' ? 'dialog' : LAND[tag];
      if (land) out.push(land + (e.getAttribute('aria-label') || role === 'dialog' ? ', ' + name(e).slice(0, 40) : '') + ' landmark' );
      if (tag === 'FORM' && role === 'dialog') { /* labelled above */ }
      for (const c of e.childNodes) walk(c);
      if (land) out.push('end of ' + land);
    };
    walk(document.body);
    // collapse runs of plain text so the buffer reads like a screen reader's line-by-line view
    return out.join('\\n');
  })()`) as Promise<string>;
}
