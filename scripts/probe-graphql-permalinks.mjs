#!/usr/bin/env node
/**
 * Probe GraphQL payloads near post message text to find real permalink / post_id fields.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.argv[2] || 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

async function main() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const samples = [];

  page.on('response', async res => {
    try {
      const u = res.url();
      if (!/graphql/i.test(u)) return;
      const body = await res.text();
      if (!body || body.length < 200) return;
      if (!/"text"\s*:/.test(body)) return;

      // Find Vietnamese RE-looking texts and capture surrounding JSON keys
      const re = /"text"\s*:\s*"((?:\\.|[^\\"]){40,500})"/g;
      let m;
      while ((m = re.exec(body)) && samples.length < 8) {
        const raw = m[1];
        if (!/(tỷ|zalo|tìm nhà|tài chính|lh |liên hệ|\d{9,})/i.test(raw)) continue;
        const start = Math.max(0, m.index - 2500);
        const end = Math.min(body.length, m.index + m[0].length + 2500);
        const window = body.slice(start, end);
        const keys = [...window.matchAll(/"([a-zA-Z0-9_]+)"\s*:/g)].map(x => x[1]);
        const uniqKeys = [...new Set(keys)].filter(k =>
          /id|url|link|post|story|permalink|feedback|shareable|legacy|node/i.test(k),
        );
        const idHits = [...window.matchAll(/"(post_id|story_id|legacy_story_id|shareable_url|url|permalink|id)"\s*:\s*"([^"]{5,200})"/g)]
          .map(x => ({ key: x[1], val: x[2].slice(0, 120) }));
        const urlHits = [...window.matchAll(/https:\\\/\\\/www\.facebook\.com\\\/groups\\\/[^"\\]+/g)]
          .map(x => x[0].replace(/\\\//g, '/').slice(0, 140));
        samples.push({
          text: raw.slice(0, 100),
          uniqKeys: uniqKeys.slice(0, 40),
          idHits: idHits.slice(0, 20),
          urlHits: [...new Set(urlHits)].slice(0, 10),
        });
      }
    } catch {}
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(2000);
  }

  console.log(JSON.stringify(samples, null, 2));
  fs.writeFileSync('/tmp/gql-permalink-probe.json', JSON.stringify(samples, null, 2));
  await page.close();
  await browser.close();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
