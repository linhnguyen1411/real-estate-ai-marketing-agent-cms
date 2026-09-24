import { chromium } from 'playwright';

const URL = 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
for (let s = 0; s < 3; s++) {
  await page.evaluate('window.scrollBy(0, Math.round(window.innerHeight*0.8))');
  await page.waitForTimeout(2500);
}
await page.waitForTimeout(1500);

const DIAG = `(() => {
  var feed = document.querySelector('[role="feed"]'); if (!feed) return [];
  function pick(el){return el?(el.innerText||'').replace(/\\s+/g,' ').trim():'';}
  function closestArticle(el){return el&&el.closest?el.closest('[role=\"article\"]'):null;}
  function isInsideComments(el){return !!(el.closest&&el.closest('[aria-label*=\"Comment\" i], [aria-label*=\"bình luận\" i], [aria-label*=\"Bình luận\" i]'));}
  var arts = feed.querySelectorAll('[role="article"]'); var out=[];
  for (var i=0;i<arts.length;i++){ var a=arts[i];
    if((a.innerText||'').length<30) continue;
    var autos=a.querySelectorAll('div[dir=\"auto\"], span[dir=\"auto\"]');
    var best=null,bl=0;
    for(var j=0;j<autos.length;j++){var t=pick(autos[j]); if(t.length>bl){bl=t.length;best=autos[j];}}
    if(!best){out.push({note:'no block'});continue;}
    // why would extractMainContent drop it?
    var insideNested = closestArticle(best)!==a;
    var insideComments = isInsideComments(best);
    // what aria-label ancestor triggered it?
    var ancestor = best.closest('[aria-label*=\"Comment\" i], [aria-label*=\"bình luận\" i], [aria-label*=\"Bình luận\" i]');
    out.push({
      idx:i, bestLen:bl, best: pick(best).slice(0,60),
      insideNested: insideNested,
      insideComments: insideComments,
      ariaLabelHit: ancestor ? (ancestor.getAttribute('aria-label')||'').slice(0,60) : null,
    });
  }
  return out;
})()`;
console.log(JSON.stringify(await page.evaluate(DIAG), null, 1));

await page.close();
await browser.close();
