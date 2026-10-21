/** A tool's timing, the way a developer reads it: "820 ms", "1.4 s", "12 s". */
export function timing(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms / 10) * 10)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 1000)} s`;
}

/** Elapsed time on a clock face: 0:07, 1:42, 1:02:05. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function ago(ms: number): string {
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`;
  const h = Math.floor(ms / 3600_000);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

export function argLine(args: Record<string, string | number | boolean>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : String(v)}`)
    .join(", ");
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
