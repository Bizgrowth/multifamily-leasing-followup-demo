// "Done means" browser check for the Upwork portfolio demo (12 pass/fail lines),
// plus the 1600x1200 screenshots for portfolio-handoff/.
// Usage: node done-check.cjs <demo.html> <output-dir>
// Requires the `playwright` package and a local Chrome install.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [, , demoArg, outArg] = process.argv;
const demoFile = path.resolve(demoArg);
const releaseDir = path.resolve(path.dirname(demoFile), '..');
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const results = [];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const errors = [];
  const open = async (width, height, scale) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(pathToFileURL(demoFile).href);
    return page;
  };
  // 1280x960 at 1.25x gives 1600x1200 images
  const p = await open(1280, 960, 1.25);
  const text = sel => p.locator(sel).innerText();
  const tab = name => p.getByRole('tab', { name }).click();
  const q = i => p.locator('#sample-queue button').nth(i).click();
  const shot = async (name, el) => {
    await p.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    if (el) {
      await p.locator(el).evaluate(node => node.scrollIntoView({ block: 'start' }));
      await p.evaluate(() => window.scrollBy(0, -20));
    }
    await p.screenshot({ path: path.join(out, name) });
  };
  async function check(name, fn) {
    let ok = false, detail = '';
    try { const r = await fn(); ok = r === true || (r && r.ok); detail = (r && r.detail) || ''; }
    catch (e) { detail = e.message.split('\n')[0]; }
    results.push({ name, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  (' + detail + ')' : ''));
    if (!ok) await p.screenshot({ path: path.join(out, 'FAIL-' + results.length + '.png') });
  }

  await shot('02.png');

  await check('Dashboard walkthrough runs on the demo data (period, reconciliation, metric, scenario)', async () => {
    const full = await text('#headline .tile:first-child strong');
    await p.selectOption('#period', '6');
    const jul = await text('#headline .tile:first-child strong');
    await p.selectOption('#period', '-1');
    await p.click('#data-checks summary');
    const recon = (await text('#checks-table')).includes('12,416.27');
    await p.click('#data-checks summary');
    await tab('Leasing box score');
    const a = await text('#box-chart .chart-summary');
    await p.selectOption('#box-metric', '3');
    const b = await text('#box-chart .chart-summary');
    await p.selectOption('#box-metric', '0');
    const d1 = await text('#pilot-result .big-delta');
    await p.fill('input[name=automation]', '95');
    const d2 = await text('#pilot-result .big-delta');
    await p.fill('input[name=automation]', '85');
    return { ok: full !== jul && recon && a !== b && d1 !== d2, detail: 'NOI ' + full + ' -> ' + jul + '; July difference flagged' };
  });
  await shot('03.png', '#boxscore');

  await tab('Follow-up lab');
  await check('Human approval works: approve, change, reject', async () => {
    await q(0);
    await p.click('#compose');
    const lockedBefore = await p.locator('#simulate-send').isDisabled();
    await p.click('#reject-draft');
    const rejected = (await text('#lab-log')).includes('rejected the draft') && await p.locator('#sample-draft').isHidden();
    await p.click('#compose');
    await p.click('#edit-draft');
    await p.fill('#draft-text', (await p.inputValue('#draft-text')) + ' Weekend tours are available.');
    await p.click('#edit-draft');
    const changed = (await text('#sample-draft')).includes('Weekend tours are available.');
    await p.click('#review-message');
    const approved = (await text('#sample-status')).includes('Approved');
    return { ok: lockedBefore && rejected && changed && approved, detail: 'send locked until approval; reject, edit and approve all logged' };
  });

  await check('Workflow runs start to finish: draft, approve, send once, reply, tour, application, move-in', async () => {
    await p.click('#simulate-send');
    await p.locator('#simulate-send').evaluate(b => { b.disabled = false; b.click(); });
    const sends = (await text('#lab-log')).split('Delivery recorded once').length - 1;
    await p.click('#simulate-reply');
    for (let i = 0; i < 3; i++) await p.click('#record-milestone');
    const log = await text('#lab-log');
    await tab('Leasing box score');
    const rows = await p.locator('#session-box tbody tr').allInnerTexts();
    const moveins = rows.find(r => r.startsWith('Confirmed move-ins')).trim().split(/\s+/).pop();
    return { ok: sends === 1 && log.includes('Confirmed move-in recorded') && moveins === '1', detail: sends + ' delivery (duplicate blocked), 1 simulated move-in' };
  });
  await shot('06.png', '#session-box');

  await check('Historical figures unchanged and labeled apart from simulated ones', async () => {
    const hist = (await text('#box-table')).includes('4,890');
    const tags = await p.locator('.tag.hist').count() > 0 && await p.locator('.tag.sim').count() > 0 && await p.locator('.tag.proj').count() > 0;
    return hist && tags;
  });

  await tab('Follow-up lab');
  await p.locator('#sample-queue button').nth(0).click();
  await check('Safeguards: STOP after approval, missing consent, screening question to staff', async () => {
    await q(1); await p.click('#compose'); await p.click('#review-message'); await p.click('#simulate-stop');
    const stop = (await text('#lab-log')).includes('STOP received after approval') && await p.locator('#sample-draft.suppressed').count() === 1;
    await shot('05.png', '#followup .lab-grid');
    await q(2); await p.click('#compose');
    const consent = (await text('#sample-status')).includes('Blocked');
    await q(3); await p.click('#compose');
    const staff = (await text('#sample-status')).includes('Routed to staff');
    return stop && consent && staff;
  });

  await check('"Demo build" and the data source show on every screen', async () => {
    const tabs = ['Property overview', 'Leasing box score', 'Follow-up lab', 'How it works'];
    for (const t of tabs) {
      await tab(t);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const badge = p.locator('.build-badge');
      if (!(await badge.isVisible()) || !(await badge.innerText()).match(/Demo build.*synthetic data/)) return { ok: false, detail: t };
    }
    return { ok: true, detail: 'fixed badge visible on all 4 tabs' };
  });

  await check('No contact details, booking links or outside links', async () => {
    const html = fs.readFileSync(demoFile, 'utf8');
    const email = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(html);
    const phone = /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/.test(html);
    const links = /href\s*=\s*["'](https?:|mailto:|tel:)|calendly|book a call|hire me/i.test(html);
    return { ok: !email && !phone && !links, detail: 'no email, phone, mailto, tel or outside link found' };
  });

  await check('No claims of client results, time saved or money saved', async () => {
    const body = (await p.evaluate(() => document.body.textContent)).toLowerCase();
    const hits = ['time saved', 'money saved', 'hours saved', 'roi', 'guarantee', 'increased occupancy', 'client result', 'testimonial']
      .filter(w => new RegExp('\\b' + w + '\\b').test(body));
    return { ok: hits.length === 0, detail: hits.join(', ') || 'none found' };
  });

  await check('No "coming soon" in the main path and every tab opens its screen', async () => {
    const body = (await p.evaluate(() => document.body.textContent)).toLowerCase();
    for (const [t, id] of [['Property overview', 'overview'], ['Leasing box score', 'boxscore'], ['Follow-up lab', 'followup'], ['How it works', 'how']]) {
      await tab(t);
      if (!(await p.locator('#' + id).isVisible())) return { ok: false, detail: t };
    }
    return !/coming soon|todo|lorem/.test(body);
  });

  await check('Works at laptop width (1440 px) and phone width (390 px)', async () => {
    const over = [];
    for (const [w, h] of [[1440, 960], [390, 844]]) {
      const page = await open(w, h, 1);
      for (const t of ['Property overview', 'Leasing box score', 'Follow-up lab', 'How it works']) {
        await page.getByRole('tab', { name: t }).click();
        const x = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (x > 0) over.push(w + 'px ' + t);
      }
      await page.close();
    }
    return { ok: over.length === 0, detail: over.join('; ') || 'no sideways scroll on any tab' };
  });

  await check('public-release/ holds only code, demo data, SOURCE.md and images', async () => {
    const allowed = /\.(html|css|js|cjs|py|md|png|svg)$/i;
    const bad = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(f => {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) return walk(full);
      const rel = path.relative(releaseDir, full).replace(/\\/g, '/');
      const data = rel.startsWith('demo-data/');
      if (!(allowed.test(f.name) || (data && /\.xlsx$/i.test(f.name)))) bad.push(rel);
    });
    walk(releaseDir);
    const source = fs.existsSync(path.join(releaseDir, 'demo-data', 'SOURCE.md'));
    return { ok: bad.length === 0 && source, detail: bad.join(', ') || 'SOURCE.md present' };
  });

  await check('Opens with no server and no console errors', async () => ({ ok: errors.length === 0, detail: errors.join('; ') || 'file:// in Chrome, 0 errors' }));

  // Screenshot 04: the review moment with Edit / Approve / Reject available
  const fresh = await open(1280, 960, 1.25);
  await fresh.getByRole('tab', { name: 'Follow-up lab' }).click();
  await fresh.locator('#sample-queue button').nth(0).click();
  await fresh.click('#compose');
  await fresh.locator('#followup .lab-grid').evaluate(n => n.scrollIntoView({ block: 'start' }));
  await fresh.evaluate(() => window.scrollBy(0, -20));
  await fresh.screenshot({ path: path.join(out, '04.png') });

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
