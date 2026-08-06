/** Format query elapsed time: seconds to 3 decimals, or m + s when >= 60s. */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, elapsedMs) / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(3)}s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds - mins * 60;
  return `${mins}m ${secs.toFixed(3)}s`;
}
