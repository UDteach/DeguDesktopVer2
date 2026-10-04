import { PetPainter } from './assets/generated/painter.mjs';
import { PetWorld, frameAt, motionDuration } from './assets/generated/motion.mjs';
import { Flock } from './flock.mjs';
const labels = { walk:'散歩', idle:'ひと休み', 'face-grooming':'お顔くしくし', rearing:'立ち上がり', 'leg-stretch':'足ぴーん', 'running-wheel':'回し車' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const heroCanvas = document.querySelector('#hero-canvas'), previewCanvas = document.querySelector('#preview-canvas');
const heroPainter = heroCanvas ? new PetPainter(heroCanvas, './assets/generated/') : null;
const painter = new PetPainter(previewCanvas, './assets/generated/');
const coat = document.querySelector('#coat'), action = document.querySelector('#action'), status = document.querySelector('#demo-status');
const heroToggle = document.querySelector('#hero-toggle'), demoToggle = document.querySelector('#demo-toggle');
const stage = previewCanvas.closest('.preview-stage'), retry = document.querySelector('#retry');
const flockButton = document.querySelector('#flock-mode'), singleButton = document.querySelector('#single-mode');
const expand = document.querySelector('#demo-expand'), preview = document.querySelector('.download-preview');
let mode = previewCanvas.dataset.count === '10' ? 'flock' : 'single', flock, heroFlock;
let catalog, selected, activeMotion, heroPaused = reduced.matches, paused = reduced.matches;
let elapsed = 0, last = null, ready = false, heroReady = false, loading = true, sequence = 0, failed = false;
const world = new PetWorld();

function diagnostics(frame = 0, size = 0, pets = []) {
  window.deguSiteDiagnostics = { ready, loading, failed, coat:selected?.id, action:action.value,
    frame, elapsed, paused, heroPaused, files:painter.images.size, draws:painter.draws, size,
    mode,count:mode==='flock' ? flock?.variants.size ?? 0 : 1,heroCount:heroFlock?.variants.size ?? (heroReady?1:0),pets };
}
function buttons() {
  for (const [button,value] of [[heroToggle,heroPaused],[demoToggle,paused]]) {
    if (!button) continue;
    button.textContent = value ? '動きを再開' : '動きを止める';
    button.setAttribute('aria-pressed',String(value));
  }
}
function actionOptions(preferred) {
  action.replaceChildren(...Object.keys(selected.motions).map(id => new Option(labels[id],id)));
  action.value = selected.motions[preferred] ? preferred : 'walk';
}
function modeButtons() {
  flockButton?.setAttribute('aria-pressed',String(mode==='flock'));
  singleButton?.setAttribute('aria-pressed',String(mode==='single'));
}
function flockProgress() {
  if (mode !== 'flock' || !flock) return;
  const count = flock.variants.size;
  ready = count>0; loading = count<catalog.length && !flock.errors.size; failed = count===0&&flock.errors.size>0;
  stage.dataset.mode = 'flock'; stage.dataset.ready = String(ready); stage.dataset.loading = String(!ready&&loading);
  stage.setAttribute('aria-busy',String(loading)); retry.hidden = !flock.errors.size;
  status.textContent = flock.errors.size ? `${count}匹を表示中。一部の画像を読み込めませんでした。` :
    count<catalog.length ? `デグーを迎えています。${count} / ${catalog.length}匹` : '10匹 · デスクトップの下端を散歩中';
  diagnostics();
}
function setMode(value) {
  ++sequence; mode = value; ready = false; elapsed = 0; last = null; flock?.resetTime(); modeButtons();
  painter.paint([],catalog,previewCanvas.clientWidth,previewCanvas.clientHeight);
  if (mode==='flock') {flockProgress();void flock.load();} else void loadMotion();
}
function resetFailedImages(loader) {
  if (!loader) return;
  for (const file of loader.failed) loader.pending.delete(file);
  loader.failed.clear();
}
async function loadMotion() {
  const ticket = ++sequence, variant = selected, id = action.value, motion = variant.motions[id];
  ready = false; loading = true; failed = false; retry.hidden = true; elapsed = 0; last = null;
  mode = 'single'; stage.dataset.mode = mode; modeButtons();
  stage.dataset.loading = 'true'; stage.dataset.ready = 'false'; stage.setAttribute('aria-busy','true');
  painter.paint([],catalog,previewCanvas.clientWidth,previewCanvas.clientHeight);
  status.textContent = `${variant.coatLabel}の${labels[id]}を読み込んでいます。`;
  diagnostics();
  try {
    // Load the chosen motion first; other coats and actions load only when selected.
    await painter.load([{...variant,motions:{[id]:motion}}]);
    if (ticket !== sequence) return;
    activeMotion = motion; ready = true; loading = false;
    stage.dataset.loading = 'false'; stage.dataset.ready = 'true'; stage.setAttribute('aria-busy','false');
    status.textContent = `${variant.coatLabel} · ${labels[id]}`;
    diagnostics();
  } catch {
    if (ticket !== sequence) return;
    loading = false; failed = true;
    stage.dataset.loading = 'false'; stage.setAttribute('aria-busy','false');
    status.textContent = '画像を読み込めませんでした。通信を確認してやり直してください。';
    retry.hidden = false; diagnostics();
  }
}
async function loadHero() {
  if (!heroPainter || (heroReady && !heroFlock?.errors.size)) return;
  try {
    if (heroCanvas.dataset.count === '10') {
      heroFlock ??= new Flock(heroPainter,catalog,() => {heroReady=heroFlock.variants.size>0;if(heroReady){heroToggle.disabled=false;buttons();}diagnostics();});
      await heroFlock.load();
      heroReady = heroFlock.variants.size>0;
      if (heroFlock.errors.size) throw Error('hero image unavailable');
      heroToggle.disabled = false; buttons(); return;
    }
    await heroPainter.load([{...catalog[0],motions:{walk:catalog[0].motions.walk,idle:catalog[0].motions.idle}}]);
    heroReady = true; heroToggle.disabled = false; buttons();
  } catch {
    heroToggle.disabled = !heroReady;if(heroReady)buttons();else heroToggle.textContent = '画像を読み込めませんでした';
    retry.hidden = false;
  }
}
async function select() {
  const preferred = action.value;
  selected = catalog.find(v => v.id === coat.value);
  actionOptions(preferred); await loadMotion();
}
async function init() {
  stage.dataset.loading = 'true'; stage.setAttribute('aria-busy','true');
  try {
    const response = await fetch('./assets/generated/catalog.json');
    if (!response.ok) throw Error('catalog unavailable');
    catalog = await response.json();
    coat.replaceChildren(...catalog.map(v => new Option(v.coatLabel,v.id)));
    selected = catalog[0]; actionOptions(previewCanvas.dataset.action ?? 'walk');
    coat.disabled = action.disabled = false;
    void loadHero();
    if (previewCanvas.dataset.count==='10') {
      flock ??= new Flock(painter,catalog,flockProgress);
      flockButton.disabled = singleButton.disabled = false;
      expand.disabled = false;
      stage.dataset.mode = 'flock';
      await flock.load();flockProgress();
    } else await loadMotion();
  } catch {
    loading = false; failed = true;
    stage.dataset.loading = 'false'; stage.setAttribute('aria-busy','false');
    status.textContent = 'デグーを読み込めませんでした。通信を確認してやり直してください。';
    retry.hidden = false; diagnostics();
  }
}
coat.addEventListener('change',() => {mode='single';modeButtons();void select();});
action.addEventListener('change',loadMotion);
flockButton?.addEventListener('click',() => setMode('flock'));
singleButton?.addEventListener('click',() => setMode('single'));
expand?.addEventListener('click',async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await preview.requestFullscreen();
  } catch {status.textContent='このブラウザーでは全画面にできません。通常の表示でお試しください。';}
});
document.addEventListener('fullscreenchange',() => {if(expand)expand.textContent=document.fullscreenElement?'元の大きさに戻す':'大きく見る';flock?.resetTime();last=null;});
heroToggle?.addEventListener('click',() => { heroPaused = !heroPaused; world.last = null; buttons(); diagnostics(); });
demoToggle.addEventListener('click',() => { paused = !paused; last = null; buttons(); diagnostics(); });
retry.addEventListener('click',() => {
  resetFailedImages(painter); resetFailedImages(heroPainter);
  if (catalog) {heroFlock?.retry();void loadHero();if(mode==='flock'){flock.retry();flockProgress();}else void loadMotion();} else void init();
});
reduced.addEventListener('change',event => { heroPaused = paused = event.matches; last = null; world.last = null; buttons(); diagnostics(); });
document.addEventListener('visibilitychange',() => { last = null; world.last = null; flock?.resetTime();heroFlock?.resetTime(); });

function render(now) {
  if (!document.hidden) {
    if (heroReady) {
      if (heroFlock) heroFlock.draw(now,heroCanvas,heroPaused);
      else {
      const width = heroCanvas.clientWidth, height = heroCanvas.clientHeight;
      const settings = {size:96,speed:1,rangeStart:0,rangeEnd:100,offset:0,paused:heroPaused,hidden:false,showNames:false};
      const variants = [{...catalog[0],motions:{walk:catalog[0].motions.walk,idle:catalog[0].motions.idle}}];
      const pets = world.step(now,{x:0,y:0,width,height},settings,[{slot:0,coat:catalog[0].id}],variants);
      heroPainter.paint(pets,catalog,width,height);
      }
    }
    if (ready) {
      if (mode==='flock') {
        const pets=flock.draw(now,previewCanvas,paused);
        diagnostics(pets[0]?.frame ?? 0,pets[0]?.height ?? 0,pets);
      } else {
      if (last !== null && !paused) elapsed += Math.min(now-last,100);
      last = now;
      const width = previewCanvas.clientWidth, height = previewCanvas.clientHeight;
      const maxScale = Math.max(...Object.values(selected.motions).map(m => m.displayScale ?? 1));
      const baseSize = Math.min(Number(previewCanvas.dataset.size ?? 96),(height-32)/maxScale,(width-32)/(1.5*maxScale));
      const size = baseSize*(activeMotion.displayScale ?? 1), total = motionDuration(activeMotion), t = elapsed%total;
      const fade = activeMotion.transitionMs ?? 0, opacity = fade ? Math.min(1,t/fade,(total-t)/fade) : 1;
      const frame = frameAt(Math.max(0,t-fade),activeMotion.durations), walking = action.value === 'walk';
      let x = (width-size*1.5)/2;
      if (walking) x += Math.sin(elapsed/1700)*Math.max(0,(width-size*1.5)/2-20);
      painter.paint([{coat:selected.id,action:action.value,x,y:height-16-size,width:size*1.5,height:size,
        frame,opacity,left:walking && Math.cos(elapsed/1700)<0}],catalog,width,height);
      diagnostics(frame,baseSize);
      }
    }
  }
  requestAnimationFrame(render);
}
buttons(); diagnostics(); void init(); requestAnimationFrame(render);
