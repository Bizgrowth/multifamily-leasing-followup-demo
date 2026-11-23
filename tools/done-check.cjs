// "Done means" browser check for the Real-work build (pass/fail lines),
// plus the 1600x1200 screenshots for portfolio-handoff/.
// Usage: node done-check.cjs <demo.html> <output-dir> [--block-file names.txt]
// The optional block file lists names that must never appear in the page (one per line).
// Requires the `playwright` package and a local Chrome install.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [, , demoArg, outArg, ...rest] = process.argv;
const blockIndex = rest.indexOf('--block-file');
const blockNames = blockIndex >= 0 && rest[blockIndex + 1]
  ? fs.readFileSync(rest[blockIndex + 1], 'utf8').split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean) : [];
const demoFile = path.resolve(demoArg);
const releaseDir = path.resolve(path.dirname(demoFile), '..');
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const results = [];
const html = fs.readFileSync(demoFile, 'utf8');
const embedded = JSON.parse(/<script id="workbook"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
const model = JSON.parse(/<script id="ai-model"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
const rowOf = name => embedded.leasing.find(r => r.name === name);
const fmt = n => n.toLocaleString('en-US');
const BADGE = 'Projected model, not results';

// The default bridge, worked out here separately from the page.
function expectedBridge() {
  const a = model.assumptions;
  const lift = model.pro_forma.find(r => r.measure === 'Submitted Applications').total / rowOf('Submitted Applications').reported - 1;
  let revenue = 0, cost = 0;
  for (const d of a.drivers) {
    const value = d.base * (d.lever === 'application_lift' ? lift : d.lever);
    if (d.group === 'revenue') revenue += value; else cost += value;
  }
  const ai = a.ai_cost_per_unit_month * embedded.units * 12;
  return Math.trunc(revenue + cost - revenue * a.management_fee - ai);
}

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
      await p.evaluate(() => window.scrollBy(0, -56));
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

  await check('Dashboard walkthrough runs on the 2025 records (tiles, period, reconciliation, metric, scenario, review brief)', async () => {
    const labels = (await p.locator('#headline .tile .label').allInnerTexts()).join('|');
    const layout = labels === 'Occupancy|Total prospects|Submitted guest cards|Converted to visits|Submitted applications|Converted to leases|Lead-to-lease';
    const headings = (await p.locator('#overview h2').allInnerTexts()).join('|');
    const panels = ['Occupancy trend', 'Visits trend', 'Manager review brief'].every(h => headings.includes(h)) &&
      (await p.locator('#leasing summary').innerText()).includes('Leasing activity by channel');
    const body = (await text('#overview')).toLowerCase();
    const gone = !/financial performance|selected accounts|controllable noi/.test(body);
    const tiles = await p.locator('#headline .tile strong').allInnerTexts();
    const figures = tiles[1] === fmt(rowOf('Total Prospects').reported) && tiles[2] === '319' && tiles[4] === '232' && tiles[5] === '204' && tiles[6] === '12.9%';
    const full = tiles[0];
    await p.selectOption('#period', '6');
    const jul = (await p.locator('#headline .tile strong').allInnerTexts())[0];
    await p.selectOption('#period', '-1');
    await p.click('#data-checks summary');
    const recon = (await text('#check-count')).includes('All 14 totals match') &&
      embedded.leasing.every(r => r.months.reduce((a, b) => a + b, 0) === r.reported);
    await p.click('#data-checks summary');
    await p.click('#generate');
    const brief = (await text('#brief')).includes('Occupancy was') && (await text('#brief')).includes('Lead-to-lease was 12.9%') && await p.locator('#approve').isVisible();
    await p.click('#approve');
    const reviewed = (await text('#review-status')).includes('Reviewed in this session');
    await tab('Leasing box score');
    const a = await text('#box-chart .chart-summary');
    await p.selectOption('#box-metric', '3');
    const b = await text('#box-chart .chart-summary');
    await p.selectOption('#box-metric', '0');
    const d1 = await text('#pilot-result .big-delta');
    await p.fill('input[name=automation]', '95');
    const d2 = await text('#pilot-result .big-delta');
    await p.fill('input[name=automation]', '85');
    const units = await p.locator('input[name=moveouts]').getAttribute('max');
    const boxNames = (await p.locator('#box-table tbody th').allInnerTexts()).join('|');
    const boxHas = boxNames.includes('Submitted Guest Cards') && boxNames.includes('Converted To Leases');
    return { ok: layout && panels && gone && figures && full !== jul && recon && brief && reviewed && a !== b && d1 !== d2 && boxHas && units === String(embedded.units),
      detail: 'tiles 319 guest cards, 232 applications, 204 leases, 12.9% lead-to-lease; occupancy ' + full + ' (Dec) -> ' + jul + ' (Jul); 14 of 14 totals match; scenario on ' + units + ' units' };
  });
  await shot('03.png', '#boxscore');

  await tab('Projected AI impact');
  await check('Projected AI impact tab opens; every 2026 number sits under the "' + BADGE + '" badge', async () => {
    const visible = await p.locator('#impact').isVisible();
    const bar = (await text('#build-badge')).startsWith(BADGE);
    const number26 = await p.locator('#impact .y26').count();
    const outside = await p.locator('.y26').evaluateAll(nodes => nodes.filter(n => !n.closest('#impact')).length);
    const unlabeled = await p.evaluate(label => [...document.querySelectorAll('#impact section.panel')]
      .filter(sec => sec.querySelector('.y26') && ![...sec.querySelectorAll('.tag')].some(t => t.textContent.trim() === label)).length, BADGE);
    const leaks = await p.evaluate(() => ['overview', 'boxscore', 'followup', 'how']
      .some(id => /Projected model, not results|2026 AI pro forma/.test(document.getElementById(id).textContent)));
    const pf = await text('#pf-table');
    const table = [['319', '556'], ['348', '476'], ['447', '235'], ['232', '320'], ['23', '27'], ['204', '290'], ['228', '2,373'], ['627', '2,529'], ['6,317', '3,954']]
      .every(pair => pair.every(n => pf.includes(n))) && pf.includes('1,581');
    const closeNote = (await text('#close-note')).includes('99.0% in 2026 vs 97.6% in 2025');
    const sums = model.pro_forma.every(r => r.months.reduce((a, b) => a + b, 0) === r.total);
    const get = name => model.pro_forma.find(r => r.measure === name).months;
    const leasesOk = get('Converted To Leases').every((v, i) => v <= get('Submitted Applications')[i] - get('Rejected Applications')[i]);
    return { ok: visible && bar && number26 > 0 && outside === 0 && unlabeled === 0 && !leaks && table && closeNote && sums && leasesOk,
      detail: number26 + ' projected figures, all under the badge; 2026 totals and the close-rate note match; leases never exceed approved applications' };
  });

  await check('Staff scorecard is computed from the 2025 rows', async () => {
    const t = await text('#score-table');
    const values = ['20.2%', '0.14', '29.2%', '12.9%', '9.9%', '97.6%', '35.2%', '1.50', '45.0%', '18.3%', '8.4%', '99.0%'].every(v => t.includes(v));
    const status = (await p.locator('#score-table .score').allInnerTexts()).join('|') === 'Gap|Largest gap|Gap|Gap|Gap|Gap';
    return { ok: values && status, detail: 'six measures; one "Largest gap" (follow-up calls per prospect), the rest "Gap"' };
  });

  await check('Changing an assumption updates the bridge totals, and reset restores $' + fmt(expectedBridge()), async () => {
    const expected = '$' + fmt(expectedBridge());
    const first = await text('#out-net');
    const defaults = first === expected && expected === '$165,592' && (await text('#out-unit')) === '$511' && (await text('#out-roi')) === '11.4x' &&
      (await text('#out-payback')) === '1.0 month' && (await text('#out-value')) === '$2.88M' &&
      (await text('#b-ltl-lift')) === '$52,458' && (await text('#b-appfee-lift')) === '$5,204' && (await text('#lift-fee')) === '-$6,664' && (await text('#lift-ai')) === '-$14,580';
    await p.fill('#b-ltl-lever', '50');
    const a = await text('#out-net');
    await p.fill('#ai-rate', '6');
    const b = await text('#out-net');
    const roi = await text('#out-roi');
    await p.fill('#cap-rate', '5');
    const value = await text('#out-value');
    await p.click('#bridge-reset');
    const reset = (await text('#out-net')) === expected && (await p.inputValue('#b-ltl-lever')) === '25' && (await p.inputValue('#ai-rate')) === '3.75' && (await text('#out-value')) === '$2.88M';
    return { ok: defaults && a !== first && b !== a && roi !== '11.4x' && value !== '$2.88M' && reset,
      detail: 'defaults ' + first + ', $511 per unit, 11.4x, 1.0 month, $2.88M; edits moved it to ' + a + ' then ' + b + '; reset back to ' + expected };
  });
  await shot('07.png', '#impact');
  await shot('08.png', '#bridge');

  await check('Automation build: two built cards, three next-phase cards, image slots and the planned stack', async () => {
    const built = await p.locator('#auto-built .card').count(), next = await p.locator('#auto-next .card').count();
    const builtTags = (await p.locator('#auto-built .tag').allInnerTexts()).every(t => t === model.automation.built_label);
    const nextTags = (await p.locator('#auto-next .tag').allInnerTexts()).every(t => t === model.automation.next_label);
    const slots = await p.locator('#auto-built .shot-slot').count() + await p.locator('#auto-built img.shot').count();
    const ids = (await p.locator('#auto h3, #auto-built h3, #auto-next h3').allInnerTexts()).join('|');
    const stack = await text('#stack-table');
    const stackOk = ['Claude API', 'n8n', 'Retell AI and Twilio', 'Cal.com', 'Supabase', 'Deepgram'].every(n => stack.includes(n)) &&
      (await text('#stack-label')) === model.automation.stack_label;
    return { ok: built === 2 && next === 3 && builtTags && nextTags && slots === 2 && ['WF-1', 'WF-5', 'WF-2', 'WF-3', 'WF-4'].every(i => ids.includes(i)) && stackOk,
      detail: 'WF-1 and WF-5 built and tested, not live; WF-2, WF-3 and WF-4 designed, not built; 2 image slots' };
  });
  await shot('09.png', '#auto-title');

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

  await check('Measured figures unchanged and labeled apart from simulated and projected ones', async () => {
    const both = fmt(rowOf('Follow Up Emails').reported + rowOf('Follow Up Texts').reported);
    const hist = (await text('#box-table')).includes(both);
    const tags = await p.locator('.tag.hist').count() > 0 && await p.locator('.tag.sim').count() > 0 && await p.locator('.tag.proj').count() > 0;
    const legend = (await p.locator('.legend').first().innerText()).includes('Measured (2025 records)') && (await p.locator('.legend').first().innerText()).includes(BADGE);
    const m25 = await p.evaluate(() => [...document.querySelectorAll('#impact .m25')].length);
    return { ok: hist && tags && legend && m25 > 0, detail: 'email + text follow-ups ' + both + ' for the year; tagged Measured, Scenario projection, Simulated, ' + BADGE };
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

  await check('Top bar shows on every screen: "Real-work build" on four, "' + BADGE + '" on the model tab', async () => {
    const tabs = ['Property overview', 'Leasing box score', 'Projected AI impact', 'Follow-up lab', 'How it works'];
    for (const t of tabs) {
      await tab(t);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const badge = p.locator('.build-badge');
      const label = t === 'Projected AI impact' ? /^Projected model, not results.*2025 leasing records, name removed/ : /Real-work build.*2025 leasing records, name removed.*Follow-up lab simulated/;
      if (!(await badge.isVisible()) || !label.test(await badge.innerText())) return { ok: false, detail: t };
    }
    return { ok: true, detail: 'fixed bar visible on all 5 tabs' };
  });

  await check('No contact details, booking links or outside links', async () => {
    const email = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(html);
    const phone = /\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/.test(html);
    const links = /href\s*=\s*["'](https?:|mailto:|tel:)|calendly|book a call|hire me/i.test(html);
    return { ok: !email && !phone && !links, detail: 'no email, phone, mailto, tel or outside link found' };
  });

  await check('No property, place, owner or financial-statement words on the page', async () => {
    const lowered = html.toLowerCase();
    const generic = ['lender', 'mortgage', 'depreciation', 'net income', 'payroll', 'gross potential', 'total income', 'insurance'];
    const hits = [...generic, ...blockNames].filter(w => lowered.includes(w));
    return { ok: hits.length === 0 && blockNames.length > 0,
      detail: hits.length ? 'found: ' + hits.length + ' blocked word(s)' : blockNames.length ? 'none of ' + (generic.length + blockNames.length) + ' blocked words found' : 'no --block-file given, so property and place names were not checked' };
  });

  await check('No claims of client results, time saved or money saved (the model tab may say ROI, labeled projected)', async () => {
    const scan = await p.evaluate(() => {
      const clean = node => { const c = node.cloneNode(true); c.querySelectorAll('script').forEach(s => s.remove()); return c; };
      const whole = clean(document.body);
      const model = whole.querySelector('#impact');
      const modelText = model.textContent.toLowerCase();
      model.remove();
      return { outside: whole.textContent.toLowerCase(), inside: modelText };
    });
    const always = ['time saved', 'money saved', 'hours saved', 'guarantee', 'increased occupancy', 'client result', 'testimonial', 'results were achieved', 'we achieved'];
    const hits = [...always, 'roi', 'payback'].filter(w => new RegExp('\\b' + w + '\\b').test(scan.outside))
      .concat(always.filter(w => new RegExp('\\b' + w + '\\b').test(scan.inside)));
    return { ok: hits.length === 0, detail: hits.join(', ') || 'none found' };
  });

  await check('No "coming soon" in the main path and every tab opens its screen', async () => {
    const body = (await p.evaluate(() => document.body.textContent)).toLowerCase();
    for (const [t, id] of [['Property overview', 'overview'], ['Leasing box score', 'boxscore'], ['Projected AI impact', 'impact'], ['Follow-up lab', 'followup'], ['How it works', 'how']]) {
      await tab(t);
      if (!(await p.locator('#' + id).isVisible())) return { ok: false, detail: t };
    }
    return !/coming soon|todo|lorem/.test(body);
  });

  await check('Works at laptop width (1440 px) and phone width (390 px)', async () => {
    const over = [];
    for (const [w, h] of [[1440, 960], [390, 844]]) {
      const page = await open(w, h, 1);
      for (const t of ['Property overview', 'Leasing box score', 'Projected AI impact', 'Follow-up lab', 'How it works']) {
        await page.getByRole('tab', { name: t }).click();
        const x = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (x > 0) over.push(w + 'px ' + t);
      }
      await page.close();
    }
    return { ok: over.length === 0, detail: over.join('; ') || 'no sideways scroll on any tab' };
  });

  await check('public-release/ holds only code, public data, SOURCE.md and images, and no old demo data', async () => {
    const allowed = /\.(html|css|js|cjs|py|md|png|svg)$/i;
    const bad = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(f => {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) return f.name === '.git' ? null : walk(full);
      const rel = path.relative(releaseDir, full).replace(/\\/g, '/');
      const data = rel.startsWith('data/');
      if (!(allowed.test(f.name) || rel === 'CNAME' || (data && /\.(xlsx|csv|json)$/i.test(f.name)))) bad.push(rel);
    });
    walk(releaseDir);
    const needed = ['SOURCE.md', 'leasing-2025-public.xlsx', 'leasing-2025-system-pull.csv', 'ai-model-2026.json'].filter(f => !fs.existsSync(path.join(releaseDir, 'data', f)));
    const oldData = fs.existsSync(path.join(releaseDir, 'demo-data'));
    const page = (await p.evaluate(() => document.documentElement.outerHTML)).toLowerCase();
    const oldWords = ['synthetic', 'fictional property'].filter(w => page.includes(w));
    return { ok: bad.length === 0 && needed.length === 0 && !oldData && oldWords.length === 0,
      detail: bad.join(', ') || (needed.length ? 'missing ' + needed.join(', ') : oldData ? 'demo-data/ still exists' : oldWords.join(', ') || 'data files and SOURCE.md present') };
  });

  await check('Opens with no server and no console errors', async () => ({ ok: errors.length === 0, detail: errors.join('; ') || 'file:// in Chrome, 0 errors' }));

  // Screenshot 04: the review moment with Edit / Approve / Reject available
  const fresh = await open(1280, 960, 1.25);
  await fresh.getByRole('tab', { name: 'Follow-up lab' }).click();
  await fresh.locator('#sample-queue button').nth(0).click();
  await fresh.click('#compose');
  await fresh.locator('#followup .lab-grid').evaluate(n => n.scrollIntoView({ block: 'start' }));
  await fresh.evaluate(() => window.scrollBy(0, -56));
  await fresh.screenshot({ path: path.join(out, '04.png') });

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
