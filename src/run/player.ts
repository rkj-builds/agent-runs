import type { Decision, RunEvent } from "./types";

/**
 * Plays a scripted run against a clock, the way a live stream arrives.
 * It stops at an approval until a person decides; everything after the decision
 * shifts to start from the moment they decided.
 */
export class LivePlayer {
  readonly played: RunEvent[] = [];
  private cursor = 0;
  private offset = 0;

  constructor(
    private readonly script: readonly RunEvent[],
    /** Replays the script's own decisions instead of waiting for one (runs that finished before you looked). */
    private readonly autoDecide = false,
  ) {}

  /** Plays every event due by `now`. Returns true when anything new arrived. */
  advance(now: number): boolean {
    const before = this.played.length;
    while (this.cursor < this.script.length) {
      const e = this.script[this.cursor];
      if (!e) break;
      if (e.type === "approval.resolve" && !this.autoDecide) break;
      if (e.t + this.offset > now) break;
      this.played.push({ ...e, t: e.t + this.offset });
      this.cursor++;
    }
    return this.played.length > before;
  }

  /** The approval the run is waiting on, if any. */
  get pending(): string | undefined {
    const next = this.script[this.cursor];
    const last = this.played.at(-1);
    return next?.type === "approval.resolve" && last?.type === "approval.request" ? next.id : undefined;
  }

  decide(decision: Decision, now: number): void {
    const next = this.script[this.cursor];
    if (next?.type !== "approval.resolve") return;
    this.played.push({ t: now, type: "approval.resolve", id: next.id, decision, by: "you" });
    this.cursor++;
    if (decision === "held") {
      this.played.push({
        t: now,
        type: "run.end",
        outcome: "held",
        summary: "Held by you. Nothing was sent.",
      });
      this.cursor = this.script.length;
      return;
    }
    this.offset = now - next.t;
  }

  get finished(): boolean {
    return this.played.at(-1)?.type === "run.end";
  }
}
