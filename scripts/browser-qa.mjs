import { chromium, firefox, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const url = process.env.QA_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT || 'output/playwright';
await mkdir(output, { recursive: true });
const winning = JSON.parse(await readFile(new URL('../tests/fixtures/winning-replay.json', import.meta.url), 'utf8'));
const report = { url, startedAt: new Date().toISOString(), cases: [], limitations: 'Browser automation and device emulation, not physical phone or tablet testing.' };
const state = page => page.evaluate(() => window.__STILLBLADE__.getState());
const cell = (page, p) => page.locator(`[data-cell="${p.x},${p.y}"]`);

async function press(locator, touch) { await (touch ? locator.tap() : locator.click()); }
async function scenario(page, id, touch) {
  if (await page.locator('#modal-close').count()) await press(page.locator('#modal-close'), touch);
  await press(page.locator('#scenarios'), touch);
  await press(page.locator(`[data-scenario="${id}"]`), touch);
  assert.equal((await state(page)).scenario, id);
}
async function command(page, cmd, touch) {
  const before = await state(page);
  const predicted = await page.evaluate(c => window.__STILLBLADE__.preview(c), cmd);
  assert.equal(predicted.ok, true, `${JSON.stringify(cmd)}: ${predicted.error}`);
  await press(page.locator(`[data-action="${cmd.kind}"]`), touch);
  if (cmd.kind === 'parry' || cmd.kind === 'sweep') {
    await press(cell(page, cmd.to || before.player), touch);
    for (const id of cmd.targets || [cmd.target]) await press(cell(page, before.enemies.find(e => e.id === id)), touch);
  } else if (cmd.to) await press(cell(page, cmd.to), touch);
  else if (cmd.target) await press(cell(page, before.enemies.find(e => e.id === cmd.target)), touch);
  if (cmd.payment) {
    for (const soul of before.fresh) {
      const checkbox = page.locator(`[data-soul="${soul.id}"]`);
      if (await checkbox.isChecked() !== cmd.payment.fresh.includes(soul.id)) await press(checkbox, touch);
    }
    await page.locator('#reserve-payment').selectOption(String(cmd.payment.reserve));
  }
  assert.deepEqual(await state(page), before, 'Selecting and previewing must not advance time');
  assert.equal(await page.locator('#confirm').isEnabled(), true, `Confirm disabled for ${JSON.stringify(cmd)}`);
  await press(page.locator('#confirm'), touch);
  assert.deepEqual(await state(page), predicted.state, 'UI commit diverged from exact forecast');
}
async function layout(page) {
  const metrics = await page.evaluate(() => {
    const arena = document.querySelector('#arena').getBoundingClientRect();
    const cells = [...document.querySelectorAll('[data-cell]')].map(e => e.getBoundingClientRect());
    return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, arena: { left: arena.left, right: arena.right, width: arena.width }, cells: cells.length, minCellWidth: Math.min(...cells.map(c => c.width)), minCellHeight: Math.min(...cells.map(c => c.height)) };
  });
  assert.equal(metrics.cells, 63);
  assert.ok(metrics.documentWidth <= metrics.width + 1, `Horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.arena.left >= 0 && metrics.arena.right <= metrics.width + 1);
  assert.ok(metrics.minCellWidth >= 28 && metrics.minCellHeight >= 28);
  return metrics;
}

const cases = [
  { name: 'chromium-desktop', engine: chromium, viewport: { width: 1440, height: 1000 }, full: true },
  { name: 'chromium-phone', engine: chromium, viewport: { width: 390, height: 844 }, touch: true, full: true },
  { name: 'chromium-small-phone', engine: chromium, viewport: { width: 320, height: 568 }, touch: true },
  { name: 'chromium-tablet', engine: chromium, viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'chromium-landscape', engine: chromium, viewport: { width: 844, height: 390 }, touch: true },
  { name: 'firefox-desktop', engine: firefox, viewport: { width: 1366, height: 900 }, full: true },
  { name: 'webkit-phone', engine: webkit, viewport: { width: 390, height: 844 }, touch: true, full: true },
  { name: 'webkit-tablet', engine: webkit, viewport: { width: 1024, height: 768 }, touch: true },
];
for (const spec of cases) {
  const browser = await spec.engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: spec.viewport, hasTouch: !!spec.touch, isMobile: spec.engine !== firefox && !!spec.touch, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const result = { name: spec.name, viewport: spec.viewport, fullVictory: false, status: 'running' };
  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.__STILLBLADE__);
    result.layout = await layout(page);
    await page.screenshot({ path: `${output}/${spec.name}-opening.png`, fullPage: true });
    const initial = await state(page);
    await press(cell(page, { x: 5, y: 1 }), spec.touch);
    assert.deepEqual(await state(page), initial, 'Inspection changed state');
    await press(page.locator('#help'), spec.touch);
    assert.equal(await page.getByRole('dialog', { name: 'Field guide' }).isVisible(), true);
    await press(page.locator('#modal-close'), spec.touch);
    await command(page, { kind: 'slip', to: { x: 5, y: 6 } }, spec.touch);
    const saved = await state(page);
    await page.reload();
    await page.waitForFunction(() => !!window.__STILLBLADE__);
    assert.deepEqual(await state(page), saved, 'Refresh did not preserve encounter');
    await scenario(page, 'combo', spec.touch);
    for (const cmd of [{ kind: 'activate' }, { kind: 'lunge', target: 'A' }, { kind: 'bell', to: { x: 7, y: 6 } }, { kind: 'lunge', target: 'B' }, { kind: 'lunge', target: 'C' }]) await command(page, cmd, spec.touch);
    const combo = await state(page);
    assert.deepEqual([combo.kills, combo.budget, combo.fresh.length, combo.player.x, combo.player.y], [3, 2, 2, 7, 6]);
    await page.screenshot({ path: `${output}/${spec.name}-combo.png`, fullPage: true });
    await command(page, { kind: 'end' }, spec.touch);
    assert.deepEqual([(await state(page)).reserve, (await state(page)).stale.length], [1, 1]);
    await scenario(page, 'emergency', spec.touch);
    await command(page, { kind: 'wait' }, spec.touch);
    assert.equal((await state(page)).phase, 'defeat');
    assert.equal(await page.getByRole('dialog', { name: 'Encounter result' }).isVisible(), true);
    await press(page.locator('#restart-confirm'), spec.touch);
    assert.deepEqual([(await state(page)).phase, (await state(page)).actions], ['defense', 0]);
    if (spec.full) {
      await scenario(page, 'arena', spec.touch);
      for (const cmd of winning.commands) await command(page, cmd, spec.touch);
      assert.deepEqual([(await state(page)).phase, (await state(page)).player.hp], ['victory', 4]);
      result.fullVictory = true;
      await page.screenshot({ path: `${output}/${spec.name}-victory.png`, fullPage: true });
    }
    assert.deepEqual(errors, [], 'Browser errors');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.error = String(error); result.errors = errors;
    await page.screenshot({ path: `${output}/${spec.name}-failure.png`, fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    report.cases.push(result);
    await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(result));
    await browser.close();
  }
}
report.finishedAt = new Date().toISOString();
await writeFile(`${output}/browser-report.json`, JSON.stringify(report, null, 2));
