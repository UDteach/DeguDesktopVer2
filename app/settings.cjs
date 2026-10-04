const fs = require('node:fs');
const path = require('node:path');
const COATS = Object.freeze(['degu-agouti', 'degu-blue', 'degu-sand', 'degu-agouti_pied', 'degu-white', 'degu-blue_pied', 'degu-black_pied', 'degu-sand_pied', 'degu-cream_pied', 'degu-black']);
const SIZES = Object.freeze([32, 48, 64, 96]);
const DEFAULTS = Object.freeze({ version: 1, count: 1, size: 64, speed: 1, monitor: 'primary', rangeStart: 0, rangeEnd: 100, offset: 0, paused: false, hidden: false, showNames: true });
function defaults() { return { ...DEFAULTS, pets: COATS.map((coat, i) => ({ coat: i ? coat : COATS[0], name: i ? `デグー ${i + 1}` : 'もふ' })) }; }
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('設定の形式が正しくありません。');
  const s = { ...DEFAULTS, ...value };
  if (!Number.isInteger(s.count) || s.count < 1 || s.count > 10 || !SIZES.includes(s.size) || ![0.5, 1, 1.5, 2].includes(s.speed)) throw new Error('数・大きさ・速度を確認してください。');
  // Read previous settings without resetting names/coats; mode is no longer saved.
  if (value.mode !== undefined && !['wander', 'follow'].includes(value.mode)) throw new Error('設定の形式が正しくありません。');
  if (typeof s.monitor !== 'string' || !/^(primary|all|display:-?\d+)$/.test(s.monitor)) throw new Error('表示先を確認してください。');
  if (![s.rangeStart, s.rangeEnd, s.offset].every(Number.isFinite) || s.rangeStart < 0 || s.rangeEnd > 100 || s.rangeEnd - s.rangeStart < 10 || s.offset < 0 || s.offset > 240) throw new Error('歩く範囲・上下位置を確認してください。');
  if (!['paused', 'hidden', 'showNames'].every(k => typeof s[k] === 'boolean')) throw new Error('表示設定を確認してください。');
  const pets = s.pets ?? defaults().pets;
  if (!Array.isArray(pets) || pets.length !== 10 || pets.some(p => !p || !COATS.includes(p.coat) || typeof p.name !== 'string' || [...p.name].length > 20 || /[\x00-\x1f\x7f]/.test(p.name))) throw new Error('毛色・名前を確認してください。');
  return { ...Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, s[k]])), version: 1, pets: pets.map(p => ({ coat: p.coat, name: p.name.trim() })) };
}
function readSettings(file) {
  if (!fs.existsSync(file)) return { settings: defaults(), recovered: false };
  try { return { settings: validate(JSON.parse(fs.readFileSync(file, 'utf8'))), recovered: false }; }
  catch { return { settings: defaults(), recovered: true }; }
}
function writeSettings(file, settings) {
  const validated = validate(settings);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(validated, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, file);
  return validated;
}
module.exports = { COATS, SIZES, DEFAULTS, defaults, validate, readSettings, writeSettings };
