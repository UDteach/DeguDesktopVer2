// Electron screen bounds and cursor coordinates are device-independent pixels.
function selectedDisplays(displays, primaryId, selection) {
  if (!displays.length) return [];
  if (selection === 'all') return displays;
  const id = selection.startsWith('display:') ? Number(selection.slice(8)) : primaryId;
  return [displays.find(d => d.id === id) ?? displays.find(d => d.id === primaryId) ?? displays[0]];
}
function distribute(pets, displays) {
  const result = new Map(displays.map(d => [d.id, []]));
  if (!displays.length) return result;
  pets.forEach((pet, i) => result.get(displays[i % displays.length].id).push(pet));
  return result;
}
module.exports = { selectedDisplays, distribute };
