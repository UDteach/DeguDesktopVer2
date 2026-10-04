import { PetWorld, clamp } from './motion.mjs';
import { PetPainter } from './painter.mjs';
const $ = selector => document.querySelector(selector);
const painter = new PetPainter($('#preview-canvas')), world = new PetWorld();
let current = null, serial = Promise.resolve(), loading = 0, loop = 0, lastPaint = 0, loadedKey = '', ready = false;
let previewPaused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let pointer = null, queuedWrites = 0;
const errors = [];
let diagnostics = { paints: 0, pets: [], errors };
Object.defineProperty(window, 'deguPreviewDiagnostics', { get: () => structuredClone(diagnostics) });
function showError(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function saveStatus(text) { $('#save-status').textContent = text; }
function patch(value) {
  if (!current) return Promise.resolve();
  queuedWrites++; saveStatus('保存しています…');
  serial = serial.then(async () => {
    try {
      const result = await window.degu.update(typeof value === 'function' ? value(current.settings) : value);
      if (!result.ok) throw new Error(result.error);
      applyState(result.state); showError(current.note ?? '');
    } catch (error) { showError(error.message); }
    finally { queuedWrites--; if (!queuedWrites) saveStatus('変更は自動で保存されます。'); }
  });
  return serial;
}
function setValue(id, value) { const el = $(id); if (document.activeElement !== el) el.value = String(value); }
function petRows() {
  const list = $('#pet-list'), s = current.settings;
  if (list.children.length !== s.count) {
    list.replaceChildren();
    for (let slot = 0; slot < s.count; slot++) {
      const row = document.createElement('div'); row.className = 'pet-row';
      const img = document.createElement('img'); img.className = 'pet-thumbnail'; img.alt = ''; img.width = 64; img.height = 43;
      const nameField = document.createElement('div'); nameField.className = 'pet-field';
      const nameLabel = document.createElement('label'); nameLabel.htmlFor = `name-${slot}`; nameLabel.textContent = `${slot + 1}匹目の名前`;
      const name = document.createElement('input'); name.type = 'text'; name.id = nameLabel.htmlFor; name.maxLength = 20; name.autocomplete = 'off'; name.placeholder = '名前なし';
      let debounce;
      const saveName = () => { clearTimeout(debounce); const value = name.value; void patch(settings => ({ pets: settings.pets.map((p, i) => i === slot ? { ...p, name: value } : p) })); };
      name.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(saveName, 350); });
      name.addEventListener('change', saveName);
      nameField.append(nameLabel, name);
      const coatField = document.createElement('div'); coatField.className = 'pet-field';
      const coatLabel = document.createElement('label'); coatLabel.htmlFor = `coat-${slot}`; coatLabel.textContent = '毛色';
      const coat = document.createElement('select'); coat.id = coatLabel.htmlFor;
      for (const variant of current.catalog) coat.add(new Option(variant.coatLabel, variant.id));
      coat.addEventListener('change', () => { const value = coat.value; void patch(settings => ({ pets: settings.pets.map((p, i) => i === slot ? { ...p, coat: value } : p) })); });
      coatField.append(coatLabel, coat); row.append(img, nameField, coatField); list.append(row);
    }
  }
  [...list.children].forEach((row, slot) => {
    const pet = s.pets[slot], variant = current.catalog.find(v => v.id === pet.coat);
    row.querySelector('img').src = './media/' + variant.motions.walk.tiers['96'][8];
    const input = row.querySelector('input'); if (document.activeElement !== input) input.value = pet.name;
    row.querySelector('select').value = pet.coat;
  });
}
function applyState(state) {
  current = state; const s = state.settings;
  for (const [id, value] of [['#count', s.count], ['#size', s.size], ['#speed', s.speed], ['#range-start', s.rangeStart], ['#range-end', s.rangeEnd], ['#offset', s.offset]]) setValue(id, value);
  $('#show-names').checked = s.showNames;
  $('#range-start-value').textContent = `${s.rangeStart}%`; $('#range-end-value').textContent = `${s.rangeEnd}%`; $('#offset-value').textContent = `${s.offset}px`;
  $('#count-less').disabled = s.count <= 1; $('#count-more').disabled = s.count >= 10;
  $('#pause').disabled = false; $('#hide').disabled = false; $('#reset').disabled = false;
  $('#pause').textContent = s.paused ? '動きを再開' : '一時停止'; $('#pause').setAttribute('aria-pressed', String(s.paused));
  $('#hide').textContent = s.hidden ? '表示する' : '隠す'; $('#hide').setAttribute('aria-pressed', String(s.hidden));
  $('#version').textContent = `v${state.version}`;
  const monitor = $('#monitor'); monitor.replaceChildren(new Option('メイン画面', 'primary'), new Option('すべての画面', 'all'));
  for (const display of state.displays) monitor.add(new Option(display.label, `display:${display.id}`));
  monitor.value = [...monitor.options].some(o => o.value === s.monitor) ? s.monitor : 'primary';
  $('#preview-summary').textContent = `${s.count}匹 · ${s.size}px${s.paused ? ' · 一時停止' : ''}`;
  $('#preview-caption').textContent = '画面下を散歩して、ときどき休んだりダッシュしたりします。';
  $('#scene').style.height = `${Math.max(149, Math.ceil(s.size * 1.6 + 20))}px`;
  petRows();
  const key = s.pets.slice(0, s.count).map(p => p.coat).sort().join(',');
  if (key !== loadedKey) void loadPreview(key); else { notice(); schedule(); }
  if (state.note) showError(state.note);
}
function notice() {
  const el = $('#preview-notice');
  if (!ready) return;
  el.replaceChildren(); el.textContent = current.settings.hidden ? 'デグーは非表示です。「表示する」で戻せます。' : '';
  el.hidden = !current.settings.hidden;
}
async function loadPreview(key) {
  const request = ++loading; ready = false; loadedKey = key;
  cancelAnimationFrame(loop); loop = 0;
  $('#preview-notice').hidden = false; $('#preview-notice').textContent = 'デグーを読み込んでいます…';
  try {
    await painter.load(current.catalog.filter(v => current.settings.pets.slice(0, current.settings.count).some(p => p.coat === v.id)));
    if (request !== loading) return;
    ready = true; $('#preview-toggle').disabled = false; notice(); schedule();
  } catch (error) {
    if (request !== loading) return;
    errors.push(error.message); loadedKey = '';
    const el = $('#preview-notice'); el.textContent = 'デグーを読み込めませんでした。';
    const retry = document.createElement('button'); retry.className = 'button'; retry.textContent = '再読み込み';
    retry.onclick = () => { painter.pending.clear(); painter.failed.clear(); void loadPreview(key); }; el.append(retry);
  }
}
function previewButton() {
  const button = $('#preview-toggle'); button.textContent = previewPaused ? '▶' : 'Ⅱ';
  const name = previewPaused ? 'プレビューを再開' : 'プレビューを停止'; button.setAttribute('aria-label', name); button.title = name;
}
function schedule() { if (!loop && ready && current && document.visibilityState !== 'hidden') loop = requestAnimationFrame(draw); }
function draw(now) {
  loop = 0; if (!ready || document.visibilityState === 'hidden') return;
  const s = { ...current.settings, paused: current.settings.paused || previewPaused, offset: 0 };
  if (now - lastPaint >= 1000 / 60 - 1 || s.paused || s.hidden) {
    lastPaint = now;
    const scene = $('#scene'), width = scene.clientWidth, height = scene.clientHeight;
    const pets = s.hidden ? [] : world.step(now, { x: 0, y: 0, width, height }, s, s.pets.slice(0, s.count).map((p, slot) => ({ ...p, slot })), current.catalog, pointer ?? { x: width * 0.65, y: height * 0.6 });
    painter.paint(pets, current.catalog, width, height);
    diagnostics = { paints: painter.draws, pets, errors: [...painter.failed], ready, paused: s.paused };
  }
  if (!s.paused && !s.hidden) schedule();
}
$('#pause').onclick = () => patch({ paused: !current.settings.paused });
$('#hide').onclick = () => patch({ hidden: !current.settings.hidden });
$('#preview-toggle').onclick = () => { previewPaused = !previewPaused; previewButton(); schedule(); };
$('#count-less').onclick = () => patch({ count: current.settings.count - 1 });
$('#count-more').onclick = () => patch({ count: current.settings.count + 1 });
$('#count').onchange = event => { const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= 10) void patch({ count }); else { event.target.value = current.settings.count; showError('表示する数は1〜10匹から選んでください。'); } };
for (const id of ['size', 'speed']) $(`#${id}`).onchange = event => patch({ [id]: Number(event.target.value) });
$('#show-names').onchange = event => patch({ showNames: event.target.checked });
$('#monitor').onchange = event => patch({ monitor: event.target.value });
$('#range-start').oninput = event => { const value = Math.min(Number(event.target.value), Number($('#range-end').value) - 10); event.target.value = value; $('#range-start-value').textContent = `${value}%`; };
$('#range-start').onchange = event => patch({ rangeStart: Number(event.target.value) });
$('#range-end').oninput = event => { const value = Math.max(Number(event.target.value), Number($('#range-start').value) + 10); event.target.value = value; $('#range-end-value').textContent = `${value}%`; };
$('#range-end').onchange = event => patch({ rangeEnd: Number(event.target.value) });
$('#offset').oninput = event => { $('#offset-value').textContent = `${event.target.value}px`; };
$('#offset').onchange = event => patch({ offset: Number(event.target.value) });
function switchTab(name, focus = false) {
  for (const tab of document.querySelectorAll('[data-tab]')) { const selected = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; $(`#panel-${tab.dataset.tab}`).hidden = !selected; if (focus && selected) tab.focus(); }
}
for (const tab of document.querySelectorAll('[data-tab]')) { tab.onclick = () => switchTab(tab.dataset.tab); tab.onkeydown = event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); switchTab(event.key === 'Home' ? 'pets' : event.key === 'End' ? 'display' : tab.dataset.tab === 'pets' ? 'display' : 'pets', true); } }; }
$('#reset').onclick = () => $('#reset-dialog').showModal();
$('#reset-cancel').onclick = () => $('#reset-dialog').close();
$('#reset-confirm').onclick = async () => { await serial; const result = await window.degu.reset(); if (result.ok) { applyState(result.state); showError(''); } else showError(result.error); $('#reset-dialog').close(); };
$('#scene').onpointermove = event => { const bounds = event.currentTarget.getBoundingClientRect(); pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }; if (current?.settings.paused || previewPaused) schedule(); };
new ResizeObserver(schedule).observe($('#scene'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { cancelAnimationFrame(loop); loop = 0; } else schedule(); });
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { previewPaused = event.matches; previewButton(); schedule(); });
window.addEventListener('error', event => { errors.push(event.message); showError('設定画面で問題が起きました。画面を開き直してください。'); });
window.degu.onState(applyState); window.degu.onError(showError);
previewButton();
try { applyState(await window.degu.getState()); } catch (error) { showError('設定を読み込めませんでした。画面を開き直してください。'); errors.push(error.message); }
