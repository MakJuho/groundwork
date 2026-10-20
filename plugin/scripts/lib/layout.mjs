export const LAYER_NAMES = new Set([
  'controller', 'controllers', 'service', 'services', 'repository', 'repositories',
  'dao', 'mapper', 'mappers', 'entity', 'entities', 'domain', 'model', 'models',
  'dto', 'dtos', 'vo', 'web', 'api', 'handler', 'handlers', 'routes', 'views', 'serializers',
]);

export function detectLayout(paths) {
  let layered = 0;
  const parents = new Set();
  for (const p of paths) {
    const dirs = p.split('/').slice(0, -1);
    const i = dirs.findIndex((d) => LAYER_NAMES.has(d.toLowerCase()));
    if (i === -1) continue;
    layered++;
    parents.add(dirs.slice(0, i).join('/'));
  }
  const layerRatio = paths.length ? Math.round((layered / paths.length) * 100) / 100 : 0;
  const layerParents = [...parents].sort().slice(0, 50);
  let type = 'mixed';
  if (layerRatio >= 0.5 && parents.size <= 2) type = 'layer';
  else if (layerRatio < 0.2 || parents.size >= 3) type = 'feature';
  return { type, layerRatio, layerParents };
}
