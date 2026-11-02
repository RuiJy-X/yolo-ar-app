import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('demo.html')).href + '?render');
await page.evaluate(() => window.ready);
const fontStatus = await page.evaluate(() => [...document.fonts].map(f => ({ family: f.family, status: f.status })));
const metadata = await page.evaluate(() => window.VIDEO);
async function hash(t) {
  await page.evaluate(t => seek(t), t);
  return createHash('sha256').update(await page.screenshot()).digest('hex');
}
const deterministic = [];
for (const t of [3.2, 9, 15.4, 23.1, 29.6, 41.5, 49.8, 58.8]) {
  const a = await hash(t);
  await page.evaluate(() => { window.testPixels = document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1920, 1080).data; });
  await hash(59 - t);
  const exactScreenshot = a === await hash(t);
  const difference = await page.evaluate(() => {
    const p = document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1920, 1080).data;
    let maxChannelDifference = 0, changedChannels = 0;
    for (let i = 0; i < p.length; i++) { const d = Math.abs(p[i] - window.testPixels[i]); if (d) changedChannels++; maxChannelDifference = Math.max(d, maxChannelDifference); }
    return { maxChannelDifference, changedChannels };
  });
  // Chromium can round subpixel hairlines by one channel level after a cache change.
  // This tolerance rejects geometric, content, timing, and visible color differences.
  deterministic.push({ time: t, exactScreenshot, ...difference, repeatable: difference.maxChannelDifference <= 1 });
}
const seam = await hash(0) === await hash(60);
await page.evaluate(() => seek(24.5));
await page.screenshot({ path: 'timeline-detail.png' });
await page.goto(pathToFileURL(path.resolve('demo.html')).href);
await page.evaluate(() => window.ready);
await page.locator('#scrub').fill('29.6');
await page.locator('#scrub').dispatchEvent('input');
await page.locator('#play').click();
await page.waitForFunction(() => document.querySelector('#play').textContent === 'Pause');
await page.locator('#play').click();
const preview = await page.locator('#play').textContent() === 'Play';
const report = { metadata, fontStatus, deterministic, loopSeamMatches: seam, previewPlayAndPause: preview, browserErrors: errors };
writeFileSync('qa.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length || fontStatus.some(f => f.status !== 'loaded') || deterministic.some(d => !d.repeatable) || !seam || !preview) process.exit(1);
