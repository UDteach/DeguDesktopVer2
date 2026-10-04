import { PetWorld } from './motion.mjs';
import { PetPainter } from './painter.mjs';
const painter = new PetPainter(document.querySelector('#pets'));
const world = new PetWorld();
let state = null, cursor = null, token = 0, raf = 0, lastPaint = 0;
let snapshot = { ready: false, pets: [], paints: 0, revision: 0, errors: [] };
// Read-only diagnostic state, also used by the isolated smoke run.
Object.defineProperty(window, 'deguDiagnostics', { get: () => structuredClone(snapshot) });
function schedule() { if (!raf && state?.active) raf = requestAnimationFrame(draw); }
function draw(now) {
  raf = 0;
  if (!state?.active) return;
  if (now - lastPaint >= 1000 / 60 - 1 || state.settings.paused) {
    lastPaint = now;
    const pets = world.step(now, state.area, state.settings, state.pets, state.catalog, cursor);
    painter.paint(pets, state.catalog, innerWidth, innerHeight);
    snapshot = { ready: true, active: true, pets, paints: painter.draws, revision: state.revision, errors: [...painter.failed] };
  }
  if (!state.settings.paused) schedule();
}
window.degu.onState(async payload => {
  const request = ++token;
  cancelAnimationFrame(raf); raf = 0; state = null;
  try {
    await painter.load(payload.catalog.filter(v => payload.pets.some(p => p.coat === v.id)));
    if (request !== token) return;
    state = payload; snapshot = { ...snapshot, ready: true, active: payload.active, revision: payload.revision, pets: payload.active ? snapshot.pets : [] };
    window.degu.loaded(payload.revision); schedule();
  } catch (error) { if (request === token) window.degu.failed(error.message); }
});
window.degu.onCursor(value => { const changed = !cursor || cursor.x !== value.x || cursor.y !== value.y; cursor = value; if (changed && state?.settings.paused) schedule(); });
window.addEventListener('resize', schedule);
window.addEventListener('error', event => window.degu.failed(event.message));
window.addEventListener('unhandledrejection', event => window.degu.failed(event.reason?.message ?? event.reason));
window.degu.ready();
