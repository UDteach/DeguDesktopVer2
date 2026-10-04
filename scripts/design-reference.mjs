import fs from 'node:fs';
import path from 'node:path';
import { _electron } from 'playwright';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'docs/design');
fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
fs.mkdirSync(path.join(dir, 'evidence/baseline'), { recursive: true });
const pet = fs.readFileSync(path.join(root, 'app/media/degu-agouti/walk/96-008.png')).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760">
<style>text{font-family:'Yu Gothic UI','Meiryo',sans-serif;fill:#283e32} .muted{fill:#65766c;font-size:13px}.label{font-size:15px;font-weight:600}</style>
<rect width="1000" height="760" fill="#f7f8f3"/><rect width="216" height="760" fill="#edf0e7"/><path d="M216 0v760" stroke="#dce2d6"/>
<rect x="24" y="28" width="44" height="44" rx="14" fill="#d6e2ce"/><image href="data:image/png;base64,${pet}" x="20" y="28" width="52" height="40"/>
<text x="80" y="48" font-size="18" font-weight="700">DeguDesktop</text><text x="81" y="67" class="muted">Ver2</text>
<rect x="18" y="123" width="180" height="45" rx="9" fill="#dde6d5"/><text x="42" y="151" class="label">デグーと動き</text><text x="42" y="204" class="muted">表示と歩く範囲</text>
<text x="28" y="687" class="muted">MofuMouseのアニメーション</text><text x="28" y="708" class="muted">v0.2.0</text>
<text x="253" y="48" class="muted">いつもの作業に、小さな散歩。</text><text x="252" y="84" font-size="26" font-weight="700">デグーの設定</text>
<rect x="761" y="47" width="98" height="37" rx="8" fill="white" stroke="#cdd8c8"/><text x="783" y="71" font-size="13">一時停止</text><rect x="871" y="47" width="92" height="37" rx="8" fill="white" stroke="#cdd8c8"/><text x="893" y="71" font-size="13">隠す</text>
<rect x="252" y="114" width="710" height="223" rx="15" fill="#e6ecdf"/><text x="273" y="144" class="label">散歩のようす</text><text x="853" y="144" class="muted">1匹・64px</text>
<path d="M253 286h708" stroke="#b4c6a5"/><path d="M283 286q-4-25 10-38q10 26-10 38 M902 286q-22-12-16-34q20 9 16 34" fill="#bfceaf"/>
<image href="data:image/png;base64,${pet}" x="525" y="235" width="96" height="64"/><text x="273" y="318" class="muted">画面下を散歩して、ときどき休んだりダッシュしたりします。</text>
<g transform="translate(0,-112)">
<text x="253" y="505" class="label">表示する数</text><text x="495" y="505" class="label">大きさ</text><text x="746" y="505" class="label">移動速度</text><rect x="253" y="518" width="212" height="39" rx="7" fill="white" stroke="#d3dccd"/><text x="348" y="544" font-size="14">1匹</text><rect x="493" y="518" width="222" height="39" rx="7" fill="white" stroke="#d3dccd"/><text x="565" y="544" font-size="14">64px</text><rect x="745" y="518" width="217" height="39" rx="7" fill="white" stroke="#d3dccd"/><text x="817" y="544" font-size="14">ふつう</text>
<path d="M253 585h709" stroke="#dce2d6"/><text x="253" y="618" class="label">うちのデグー</text><text x="817" y="618" class="muted">毛色と名前を選ぶ</text><rect x="253" y="636" width="709" height="61" rx="8" fill="white" stroke="#d3dccd"/><image href="data:image/png;base64,${pet}" x="268" y="644" width="66" height="44"/><text x="352" y="673" font-size="14">もふ</text><text x="659" y="673" font-size="14">アグーチ</text><text x="253" y="735" class="muted">変更はすぐに反映され、次回起動にも引き継がれます。</text>
</g></svg>`;
const target = path.join(dir, 'references/selected-target.svg'); fs.writeFileSync(target, svg);
const qa = path.join(root, '.codex/qa'); fs.mkdirSync(qa, { recursive: true });
const helper = path.join(qa, 'design-browser.cjs');
fs.writeFileSync(helper, `const {app,BrowserWindow}=require('electron'); app.disableHardwareAcceleration();app.whenReady().then(()=>{const w=new BrowserWindow({width:1000,height:800,show:true});w.loadURL('about:blank')});`);
const { ELECTRON_RUN_AS_NODE, ...electronEnv } = process.env;
const electron = await _electron.launch({ executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'), args: [helper], env: electronEnv });
try {
  const page = await electron.firstWindow();
  const capture = async file => {
    await page.waitForTimeout(350);
    const bytes = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(file, Buffer.from(bytes, 'base64'));
  };
  await page.setViewportSize({ width: 1000, height: 760 });
  if (!process.argv.includes('--target-only')) {
    await page.goto('https://udteach.github.io/MofuMouse/try/', { waitUntil: 'networkidle' });
    await capture(path.join(dir, 'evidence/baseline/mofumouse-desktop.png'));
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(path.join(dir, 'evidence/baseline/mofumouse-narrow.png'));
    await page.setViewportSize({ width: 1000, height: 760 });
  }
  await page.goto(pathToFileURL(target).href);
  await capture(path.join(dir, 'references/selected-target.png'));
  console.log('Selected target captured.');
} finally { await electron.close(); }
