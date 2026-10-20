export const STACK_MANIFESTS = {
  spring: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  node: ['package.json'],
  python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
};

export const MANIFEST_NAMES = new Set(Object.values(STACK_MANIFESTS).flat());

export function detectStacks(paths) {
  const names = new Set(paths.map((p) => p.split('/').pop()));
  const found = Object.entries(STACK_MANIFESTS)
    .filter(([, manifests]) => manifests.some((n) => names.has(n)))
    .map(([stack]) => stack)
    .sort();
  if (paths.some((p) => /\.(xfdl|xprj)$/i.test(p))) return ['nexacro', ...found].sort();
  return found.length ? found : ['generic'];
}
