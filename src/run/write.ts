import type { RunEvent, ToolResult } from "./types";

/**
 * Helpers for writing a scripted run by hand. A script reads top to bottom like the run itself;
 * each helper returns its events and the time it ended, so the next step starts after it.
 */
export class Writer {
  readonly events: RunEvent[] = [];
  private n = 0;
  constructor(public t = 0) {}

  start(task: string): this {
    this.events.push({ t: this.t, type: "run.start", task });
    this.t += 250;
    return this;
  }

  /** Streams text in small chunks, at roughly the pace a model types. */
  say(text: string, msPerChunk = 55): this {
    const id = `text-${++this.n}`;
    for (const chunk of text.match(/\S+\s*/g) ?? []) {
      this.events.push({ t: this.t, type: "text", id, delta: chunk });
      this.t += msPerChunk;
    }
    this.t += 200;
    return this;
  }

  /** Nothing happens for a while: the model is working without output. */
  wait(ms: number): this {
    this.t += ms;
    return this;
  }

  call(
    name: string,
    args: Record<string, string | number | boolean>,
    ms: number,
    result: ToolResult,
    opts: { outward?: boolean } = {},
  ): this {
    const id = `tool-${++this.n}`;
    this.events.push({ t: this.t, type: "tool.start", id, name, args, ...(opts.outward ? { outward: true } : {}) });
    this.t += ms;
    this.events.push({ t: this.t, type: "tool.end", id, result });
    this.t += 200;
    return this;
  }

  /** Starts several calls together; each ends after its own time. The run moves on when the slowest is back. */
  parallel(
    calls: {
      name: string;
      args: Record<string, string | number | boolean>;
      ms: number;
      result?: ToolResult;
      retries?: { reason: string; waitMs: number }[];
      error?: string;
    }[],
  ): this {
    const group = `group-${++this.n}`;
    const t0 = this.t;
    let end = t0;
    for (const c of calls) {
      const id = `tool-${++this.n}`;
      this.events.push({ t: t0, type: "tool.start", id, name: c.name, args: c.args, group });
      let t = t0 + c.ms;
      const retries = c.retries ?? [];
      retries.forEach((r, i) => {
        this.events.push({ t, type: "tool.retry", id, reason: r.reason, attempt: i + 2, of: retries.length + 1, waitMs: r.waitMs });
        t += r.waitMs + c.ms;
      });
      this.events.push(
        c.error ? { t, type: "tool.error", id, error: c.error } : { t, type: "tool.end", id, result: c.result ?? { summary: "Done" } },
      );
      end = Math.max(end, t);
    }
    this.t = end + 200;
    this.events.sort((a, b) => a.t - b.t);
    return this;
  }

  /** A long call that reports how far it has got. */
  progress(name: string, args: Record<string, string | number | boolean>, total: number, label: string, ms: number, result: ToolResult): this {
    const id = `tool-${++this.n}`;
    this.events.push({ t: this.t, type: "tool.start", id, name, args });
    const ticks = 12;
    for (let i = 1; i <= ticks; i++) {
      this.events.push({ t: this.t + (ms * i) / ticks, type: "tool.progress", id, done: Math.round((total * i) / ticks), total, label });
    }
    this.t += ms + 120;
    this.events.push({ t: this.t, type: "tool.end", id, result });
    this.t += 200;
    return this;
  }

  /** A call that fails, is retried with a growing wait, and fails for good. */
  failing(name: string, args: Record<string, string | number | boolean>, ms: number, waits: number[], reason: string, error: string): this {
    const id = `tool-${++this.n}`;
    this.events.push({ t: this.t, type: "tool.start", id, name, args });
    this.t += ms;
    waits.forEach((w, i) => {
      this.events.push({ t: this.t, type: "tool.retry", id, reason, attempt: i + 2, of: waits.length + 1, waitMs: w });
      this.t += w + ms;
    });
    this.events.push({ t: this.t, type: "tool.error", id, error });
    this.t += 250;
    return this;
  }

  ask(title: string, detail: string, items: string[], afterMs: number, decision: "approved" | "held", note?: string): this {
    const id = `approval-${++this.n}`;
    this.events.push({ t: this.t, type: "approval.request", id, title, detail, items, ...(note ? { note } : {}) });
    this.t += afterMs;
    this.events.push({ t: this.t, type: "approval.resolve", id, decision, by: "Rahul" });
    this.t += 250;
    return this;
  }

  end(outcome: "done" | "failed" | "held", summary: string): RunEvent[] {
    this.events.push({ t: this.t, type: "run.end", outcome, summary });
    return this.events;
  }
}

/** The id of the n-th event of a type, for checks that point at a step. */
export function idsOf(events: readonly RunEvent[], type: RunEvent["type"], name?: string): string[] {
  return events
    .filter((e) => e.type === type && (!name || (e.type === "tool.start" && e.name === name)))
    .map((e) => ("id" in e ? e.id : ""));
}
