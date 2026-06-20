function speedBonusFromElapsed(elapsedMs: number | null, total: number) {
  if (!elapsedMs || total <= 1) return 0;
  const targetMs = total * 45_000;
  const ratio = Math.max(0, Math.min(1, 1 - elapsedMs / targetMs));
  return Math.round(ratio * 8);
}

function percentileFromCorrect(correct: number, total: number) {
  if (total <= 1) return correct ? 92 : 41;
  const ratio = correct / total;
  if (ratio >= 1) return 99.9;
  if (ratio >= 0.92) return 99.2;
  if (ratio >= 0.83) return 97;
  if (ratio >= 0.67) return 90;
  if (ratio >= 0.5) return 74;
  if (ratio >= 0.34) return 58;
  return 37;
}

function formatRank(percentile: number) {
  const rank = Math.max(1, Math.round(1_000_000 * ((100 - percentile) / 100)));
  return `#${rank.toLocaleString()}`;
}

export function canonicalOfficialScore(correct: number, total: number, elapsedMs: number | null) {
  const speedBonus = speedBonusFromElapsed(elapsedMs, total);
  const percentile = percentileFromCorrect(correct, total);
  const score = total === 1
    ? correct ? 138 : 104
    : Math.round(90 + (correct / total) * 52 + speedBonus);

  return {
    score,
    percentile,
    rank: formatRank(percentile),
    speedBonus,
  };
}
