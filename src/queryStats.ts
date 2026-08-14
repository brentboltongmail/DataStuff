export interface QueryStat {
  avgMs: number;
  count: number;
  lastRunMs: number;
}

export type QueryStatsMap = Record<string, QueryStat>;

/**
 * Normalizes SQL query string and calculates a 32-bit FNV-1a hash fingerprint.
 */
export function sqlFingerprint(sql: string): string {
  if (!sql) return "";
  // Strip comments, normalize whitespace, lowercase
  const normalized = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Updates query statistics for a given SQL string and execution duration.
 */
export function updateQueryStat(
  stats: QueryStatsMap,
  sql: string,
  elapsedMs: number,
): QueryStatsMap {
  if (!sql.trim() || elapsedMs <= 0) return stats;
  const hash = sqlFingerprint(sql);
  const existing = stats[hash];

  let nextStat: QueryStat;
  if (!existing) {
    nextStat = {
      avgMs: elapsedMs,
      count: 1,
      lastRunMs: elapsedMs,
    };
  } else {
    // Exponentially weighted moving average: 65% previous avg + 35% new duration
    const nextAvg = Math.round(existing.avgMs * 0.65 + elapsedMs * 0.35);
    nextStat = {
      avgMs: nextAvg,
      count: existing.count + 1,
      lastRunMs: elapsedMs,
    };
  }

  return {
    ...stats,
    [hash]: nextStat,
  };
}

export const DEFAULT_ESTIMATE_MS = 5 * 60 * 1000; // Default 5 minutes (300,000 ms) if query has no historical record

/**
 * Gets historical estimated target duration in ms for a query, defaulting to 5 minutes (300,000 ms) if unsaved in history.
 */
export function getEstimatedQueryDurationMs(
  stats: QueryStatsMap,
  sql: string,
  defaultEstimateMs = DEFAULT_ESTIMATE_MS,
): { targetMs: number; isHistorical: boolean; runCount: number } {
  if (!sql.trim()) {
    return { targetMs: defaultEstimateMs, isHistorical: false, runCount: 0 };
  }
  const hash = sqlFingerprint(sql);
  const stat = stats[hash];
  if (stat && stat.avgMs > 0) {
    return { targetMs: stat.avgMs, isHistorical: true, runCount: stat.count };
  }
  return { targetMs: defaultEstimateMs, isHistorical: false, runCount: 0 };
}

/**
 * Calculates query progress percentage (0.0% to 99.0%).
 * If elapsed time exceeds targetMs (e.g. cold cache), progress gently slows down
 * asymptotically between 95.0% and 99.0% until rows arrive.
 */
export function calculateQueryProgressPercent(
  elapsedMs: number,
  targetMs = DEFAULT_ESTIMATE_MS,
): number {
  if (elapsedMs <= 0) return 0;
  const safeTarget = Math.max(200, targetMs);

  if (elapsedMs <= safeTarget) {
    // Linear scale from 0% to 95% up to targetMs
    return parseFloat(((elapsedMs / safeTarget) * 95).toFixed(1));
  }

  // Exceeded 100% of historical average (e.g., cold cache)
  // Asymptotically crawl from 95% up to 99%
  const overdueMs = elapsedMs - safeTarget;
  const asymptoticFactor = 1 - Math.exp(-overdueMs / (safeTarget * 1.5));
  const progress = 95 + 4 * asymptoticFactor;
  return parseFloat(Math.min(99, progress).toFixed(1));
}
