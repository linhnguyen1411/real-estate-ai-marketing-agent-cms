#!/usr/bin/env node
/**
 * Capture Facebook GraphQL feed payloads while scrolling.
 * Goal: get post text even when DOM stays on "Đang tải...".
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

function walk(obj, out, depth = 0) {
  if (!obj || depth > 12) return;
  if (typeof obj === 'string') {
    if (obj.length >= 40 && obj.length < 4000) {
      // likely post body / message
      if (/[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]/i.test(obj)) {
        out.texts.push(obj);
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item, out, depth + 1);
    return;
  }
  if (typeof obj === 'object') {
    if (typeof obj.text === 'string' && obj.text.length >= 20) out.texts.push(obj.text);
    if (typeof obj.message === 'string') out.texts.push(obj.message);
    if (obj.message?.text) out.texts.push(String(obj.message.text));
    if (obj.story?.message?.text) out.texts.push(String(obj.story.message.text));
    if (obj.comet_sections?.content) walk(obj.comet_sections.content, out, depth + 1);
    for (const v of Object.values(obj)) walk(v, out, depth + 1);
  }
}

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const captured = [];

  page.on('response', async res => {
    try {
      const u = res.url();
      if (!/graphql/i.test(u) && !/api\/graphql/i.test(u)) return;
      const ct = res.headers()['content-type'] || '';
      if (!/json|javascript|text/i.test(ct) && !u.includes('graphql')) return;
      const body = await res.text();
      if (!body || body.length < 200) return;
      if (!/message|story|feed|group/i.test(body)) return;
      // Facebook often returns JSON lines
      const chunks = body.split('\n').filter(Boolean);
      for (const chunk of chunks.slice(0, 20)) {
        try {
          const json = JSON.parse(chunk);
          const bag = { texts: [] };
          walk(json, bag);
          for (const t of bag.texts) {
            if (t.length < 40) continue;
            if (/^\d+$/.test(t)) continue;
            captured.push({ len: t.length, text: t.slice(0, 200), url: u.slice(0, 80) });
          }
        } catch {
          // ignore non-json lines
        }
      }
    } catch {
      // ignore
    }
  });

  console.log('GOTO', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(2500);
    console.log('scroll', i + 1, 'captured_so_far', captured.length);
  }

  // dedupe
  const seen = new Set();
  const unique = [];
  for (const c of captured) {
    const key = c.text.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  console.log('\nUNIQUE_TEXTS', unique.length);
  for (const u of unique.slice(0, 25)) {
    console.log('---', u.len);
    console.log(u.text);
  }

  // search for user's sample markers
  const markers = ['077-4444-735', 'Mỹ Khê', '6 tỷ', 'Thanh Khê', 'Sơn Trà', 'hoà cường', 'tài chính'];
  for (const m of markers) {
    const hit = unique.find(u => u.text.toLowerCase().includes(m.toLowerCase()));
    console.log('MARKER', m, hit ? 'FOUND' : 'miss');
  }

  await page.close();
  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
