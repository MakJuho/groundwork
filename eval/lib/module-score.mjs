const round2 = (x) => Math.round(x * 100) / 100;

export function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function scoreModules(expected, actual, threshold = 0.8) {
  const details = expected.map((exp) => {
    let best = null;
    let bestJ = 0;
    for (const [id, files] of Object.entries(actual)) {
      const j = jaccard(exp.files, files);
      if (j > bestJ) {
        best = id;
        bestJ = j;
      }
    }
    return { name: exp.name, best, jaccard: round2(bestJ), matched: bestJ >= threshold };
  });
  const matched = details.filter((d) => d.matched).length;
  return { expected: expected.length, matched, accuracy: expected.length ? round2(matched / expected.length) : 0, details };
}
