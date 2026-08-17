export interface QueryStat {
  avgMs: number;
  maxMs?: number;
  coldCacheMs?: number;
  count: number;
  lastRunMs: number;
  lastRunTimestamp?: number;
  sql?: string;
}

export type QueryStatsMap = Record<string, QueryStat>;

/** Idle time in ms before a query run is considered a "cold cache" run (10 minutes). */
export const COLD_CACHE_IDLE_MS = 10 * 60 * 1000;

/** Default fallback duration estimate if query has no historical records (2 minutes). */
export const DEFAULT_ESTIMATE_MS = 2 * 60 * 1000;

/**
 * Normalizes SQL string by stripping comments, collapsing whitespace, and converting to uppercase.
 */
export function normalizeSql(sql: string): string {
  if (!sql) return "";
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Normalizes SQL query string and calculates a 32-bit FNV-1a hash fingerprint.
 */
export function sqlFingerprint(sql: string): string {
  const normalized = normalizeSql(sql);
  if (!normalized) return "";

  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Computes character-level Levenshtein distance between two normalized strings.
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let prevRow = new Int32Array(s2.length + 1);
  let currRow = new Int32Array(s2.length + 1);

  for (let j = 0; j <= s2.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    currRow[0] = i;
    const char1 = s1.charCodeAt(i - 1);
    for (let j = 1; j <= s2.length; j++) {
      const cost = char1 === s2.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,        // deletion
        currRow[j - 1] + 1,    // insertion
        prevRow[j - 1] + cost, // substitution
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[s2.length];
}

/**
 * Calculates structural similarity score (0.0 to 1.0) between two SQL statements.
 * Evaluates both character-level edit distance and token-level overlap.
 */
export function sqlSimilarity(sql1: string, sql2: string): number {
  const norm1 = normalizeSql(sql1);
  const norm2 = normalizeSql(sql2);

  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1.0;

  const maxLen = Math.max(norm1.length, norm2.length);
  const minLen = Math.min(norm1.length, norm2.length);

  // Short-circuit if length disparity is too large for 90% match
  if (minLen / maxLen < 0.75) return 0;

  // 1. Character-level similarity
  const charDist = levenshteinDistance(norm1, norm2);
  const charSimilarity = 1 - charDist / maxLen;
  if (charSimilarity >= 0.9) return charSimilarity;

  // 2. Token-level Dice similarity
  const tokens1 = norm1.split(/\s+/);
  const tokens2 = norm2.split(/\s+/);
  if (tokens1.length > 0 && tokens2.length > 0) {
    let matches = 0;
    const pool = [...tokens2];
    for (const t of tokens1) {
      const idx = pool.indexOf(t);
      if (idx !== -1) {
        matches++;
        pool.splice(idx, 1);
      }
    }
    const tokenSimilarity = (2 * matches) / (tokens1.length + tokens2.length);
    return Math.max(charSimilarity, tokenSimilarity);
  }

  return charSimilarity;
}

/**
 * Updates query statistics for a given SQL string and execution duration.
 * Distinguishes between cold cache runs (first run in a while) and warm cache runs.
 */
export function updateQueryStat(
  stats: QueryStatsMap,
  sql: string,
  elapsedMs: number,
): QueryStatsMap {
  if (!sql.trim() || elapsedMs <= 0) return stats;
  const hash = sqlFingerprint(sql);
  const existing = stats[hash];
  const now = Date.now();
  const norm = normalizeSql(sql);

  let nextStat: QueryStat;
  if (!existing) {
    nextStat = {
      avgMs: elapsedMs,
      maxMs: elapsedMs,
      coldCacheMs: elapsedMs,
      count: 1,
      lastRunMs: elapsedMs,
      lastRunTimestamp: now,
      sql: norm,
    };
  } else {
    const isColdRun =
      !existing.lastRunTimestamp || now - existing.lastRunTimestamp > COLD_CACHE_IDLE_MS;

    const nextCold = isColdRun
      ? Math.round((existing.coldCacheMs || existing.maxMs || elapsedMs) * 0.5 + elapsedMs * 0.5)
      : existing.coldCacheMs || Math.max(existing.maxMs || elapsedMs, elapsedMs);

    const nextAvg = isColdRun
      ? existing.avgMs
      : Math.round(existing.avgMs * 0.65 + elapsedMs * 0.35);

    const nextMax = Math.max(existing.maxMs || elapsedMs, elapsedMs);

    nextStat = {
      avgMs: nextAvg,
      maxMs: nextMax,
      coldCacheMs: nextCold,
      count: existing.count + 1,
      lastRunMs: elapsedMs,
      lastRunTimestamp: now,
      sql: existing.sql || norm,
    };
  }

  return {
    ...stats,
    [hash]: nextStat,
  };
}

export interface EstimatedDurationResult {
  targetMs: number;
  isHistorical: boolean;
  isColdCache: boolean;
  runCount: number;
  matchType?: "exact" | "fuzzy_90";
}

/**
 * Gets historical estimated target duration in ms for a query.
 * 1. Checks exact fingerprint match.
 * 2. If no exact match, checks for >= 90% fuzzy match in stats or history.
 * 3. Uses cold cache value (coldCacheMs / maxMs) if it hasn't been run in a while (> 10 mins).
 */
export function getEstimatedQueryDurationMs(
  stats: QueryStatsMap,
  sql: string,
  history?: { sql: string }[],
  defaultEstimateMs = DEFAULT_ESTIMATE_MS,
): EstimatedDurationResult {
  if (!sql.trim()) {
    return { targetMs: defaultEstimateMs, isHistorical: false, isColdCache: false, runCount: 0 };
  }

  const now = Date.now();
  const targetNorm = normalizeSql(sql);
  const hash = sqlFingerprint(sql);
  let matchedStat = stats[hash];
  let matchType: "exact" | "fuzzy_90" | undefined = matchedStat ? "exact" : undefined;

  // If no exact match in stats, check for >= 90% fuzzy match in stats
  if (!matchedStat) {
    let bestSim = 0;
    for (const key of Object.keys(stats)) {
      const entry = stats[key];
      if (!entry || entry.avgMs <= 0) continue;
      const entrySql = entry.sql || "";
      if (!entrySql) continue;

      const sim = sqlSimilarity(targetNorm, entrySql);
      if (sim >= 0.90 && sim > bestSim) {
        bestSim = sim;
        matchedStat = entry;
        matchType = "fuzzy_90";
      }
    }
  }

  // If still no match in stats, check query history list for >= 90% match
  if (!matchedStat && history && history.length > 0) {
    let bestHistSim = 0;
    let bestHistSql = "";
    for (const item of history) {
      if (!item.sql) continue;
      const sim = sqlSimilarity(targetNorm, item.sql);
      if (sim >= 0.90 && sim > bestHistSim) {
        bestHistSim = sim;
        bestHistSql = item.sql;
      }
    }

    if (bestHistSql) {
      const histHash = sqlFingerprint(bestHistSql);
      matchedStat = stats[histHash];
      matchType = "fuzzy_90";
    }
  }

  if (matchedStat && (matchedStat.avgMs > 0 || matchedStat.maxMs || matchedStat.lastRunMs > 0)) {
    const lastRunTs = matchedStat.lastRunTimestamp || 0;
    const isColdCache = !lastRunTs || now - lastRunTs > COLD_CACHE_IDLE_MS;

    const targetMs = isColdCache
      ? matchedStat.coldCacheMs || matchedStat.maxMs || Math.round(matchedStat.avgMs * 1.8)
      : matchedStat.avgMs || matchedStat.lastRunMs;

    return {
      targetMs: Math.max(200, targetMs),
      isHistorical: true,
      isColdCache,
      runCount: matchedStat.count,
      matchType,
    };
  }

  return { targetMs: defaultEstimateMs, isHistorical: false, isColdCache: false, runCount: 0 };
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

  // Exceeded 100% of historical average
  // Asymptotically crawl from 95% up to 99%
  const overdueMs = elapsedMs - safeTarget;
  const asymptoticFactor = 1 - Math.exp(-overdueMs / (safeTarget * 1.5));
  const progress = 95 + 4 * asymptoticFactor;
  return parseFloat(Math.min(99, progress).toFixed(1));
}
