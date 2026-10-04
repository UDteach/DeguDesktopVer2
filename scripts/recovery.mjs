import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, '.codex/qa', `recovery-${Date.now()}`);
const copy = path.join(dir, 'copy');
fs.mkdirSync(copy, { recursive: true });
fs.cpSync(path.join(root, 'app'), path.join(copy, 'app'), { recursive: true });
fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify({ name: 'degu-recovery-qa', version: '0.2.0', main: 'app/main.cjs' }), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'app/media/manifest.json'), 'utf8'));
const coat = manifest.variants.find(v => v.id !== manifest.defaultId);
const file = path.join(copy, 'app/media', coat.motions.walk.tiers['64'][0]);
const held = file + '.qa-held';
assert.ok(file.startsWith(copy + path.sep));
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
let electron;
const report = { date: new Date().toISOString(), checks: [], passed: false };
try {
  electron = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [copy, `--qa-profile=${path.join(dir, 'profile')}`, '--settings'], env });
  let settings;
  for (let i = 0; i < 100; i++) {
    settings = electron.windows().find(p => p.url().endsWith('/settings.html'));
    if (settings) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(settings, 'settings window loads');
  await settings.waitForFunction(() => window.deguPreviewDiagnostics?.ready);
  // Only the isolated copy is damaged, after startup integrity checks pass.
  fs.renameSync(file, held);
  await settings.locator('#coat-0').selectOption(coat.id);
  await settings.getByRole('button', { name: '再読み込み', exact: true }).waitFor();
  assert.match(await settings.locator('#preview-notice').innerText(), /読み込めませんでした/);
  await settings.screenshot({ path: path.join(dir, 'missing-image.png') });
  report.checks.push('a missing PNG displays an actionable preview error');
  fs.renameSync(held, file);
  await settings.getByRole('button', { name: '再読み込み', exact: true }).click();
  await settings.waitForFunction(id => window.deguPreviewDiagnostics?.ready && window.deguPreviewDiagnostics.pets[0]?.coat === id, coat.id);
  assert.deepEqual(await settings.evaluate(() => window.deguPreviewDiagnostics.errors), []);
  report.checks.push('retry decodes restored images and paints the chosen coat');
  await electron.close(); electron = null;
  electron = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [copy, `--qa-profile=${path.join(dir, 'profile')}`, '--settings'], env });
  for (let i = 0; i < 100; i++) {
    const overlay = electron.windows().find(p => p.url().endsWith('/overlay.html'));
    if (overlay && await overlay.evaluate(() => window.deguDiagnostics?.ready && window.deguDiagnostics.paints > 0)) { report.checks.push('restart restores the overlay after the missing image is replaced'); break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(report.checks.length, 3);
  report.passed = true;
} catch (error) { report.error = error.stack; process.exitCode = 1; }
finally {
  if (fs.existsSync(held)) fs.renameSync(held, file);
  if (electron) await electron.close();
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
