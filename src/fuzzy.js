export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^province of\s+/, "")
    .replace(/\s+province$/, "");
}

/** Edit distance that treats an adjacent transposition as one change. */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function typoAllowance(length) {
  if (length <= 5) return 1;
  if (length <= 12) return 2;
  return 3;
}

function labelsOf(place) {
  return [place.name, ...(place.aliases || [])].map(normalizeName).filter(Boolean);
}

function distanceTo(guess, place) {
  const labels = labelsOf(place);
  if (!labels.length) return Infinity;
  return Math.min(...labels.map((label) => editDistance(guess, label)));
}

/**
 * True when `input` is the place's name, an alias, or a near miss.
 * Pass the full catalog so a guess that names a different place is rejected.
 */
export function matchesPlace(input, place, catalog = []) {
  const guess = normalizeName(input);
  if (guess.length < 2) return false;
  const labels = labelsOf(place);
  const distance = distanceTo(guess, place);
  const nearest = labels.reduce((best, label) =>
    Math.abs(label.length - guess.length) < Math.abs(best.length - guess.length) ? label : best
  );
  const allowance = typoAllowance(nearest.length);
  if (distance > allowance || Math.abs(guess.length - nearest.length) > allowance) return false;

  const numbers = (value) => (value.match(/\d+/g) || []).join(",");
  if (labels.every((label) => numbers(label) !== numbers(guess) && (numbers(label) || numbers(guess)))) {
    return false;
  }

  for (const other of catalog) {
    if (!other || other.id === place.id) continue;
    if (distanceTo(guess, other) <= distance) return false;
  }
  return true;
}
