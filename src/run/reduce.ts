import type { RunEvent, RunState, Step, ToolStep } from "./types";

export const emptyRun = (): RunState => ({ task: "", status: "running", steps: [], lastT: 0 });

/** Folds one event into the run. Pure: the replay calls it over a prefix of the same list. */
export function step(run: RunState, e: RunEvent): RunState {
  const next: RunState = { ...run, lastT: e.t };
  switch (e.type) {
    case "run.start":
      return { ...next, task: e.task, status: "running" };
    case "text": {
      const last = run.steps.at(-1);
      if (last?.kind === "text" && last.id === e.id) {
        return { ...next, steps: replaceLast(run.steps, { ...last, text: last.text + e.delta, lastT: e.t }) };
      }
      return { ...next, steps: [...closeText(run.steps), { kind: "text", id: e.id, t: e.t, lastT: e.t, text: e.delta, open: true }] };
    }
    case "tool.start":
      return {
        ...next,
        steps: [
          ...closeText(run.steps),
          {
            kind: "tool",
            id: e.id,
            t: e.t,
            name: e.name,
            args: e.args,
            ...(e.group ? { group: e.group } : {}),
            outward: e.outward ?? false,
            status: "running",
            attempts: 1,
          },
        ],
      };
    case "tool.progress":
      return { ...next, steps: updateTool(run.steps, e.id, { progress: { done: e.done, total: e.total, label: e.label } }) };
    case "tool.retry":
      return {
        ...next,
        steps: updateTool(run.steps, e.id, (s) => ({
          status: "retrying",
          attempts: Math.max(s.attempts, e.attempt),
          retry: { reason: e.reason, attempt: e.attempt, of: e.of, until: e.t + e.waitMs },
        })),
      };
    case "tool.end":
      return { ...next, steps: updateTool(run.steps, e.id, { status: "ok", endT: e.t, result: e.result, retry: undefined }) };
    case "tool.error":
      return { ...next, steps: updateTool(run.steps, e.id, { status: "error", endT: e.t, error: e.error, retry: undefined }) };
    case "approval.request":
      return {
        ...next,
        status: "waiting",
        steps: [
          ...closeText(run.steps),
          {
            kind: "approval",
            id: e.id,
            t: e.t,
            title: e.title,
            detail: e.detail,
            items: e.items,
            ...(e.note ? { note: e.note } : {}),
          },
        ],
      };
    case "approval.resolve":
      return {
        ...next,
        status: "running",
        steps: run.steps.map((s) =>
          s.kind === "approval" && s.id === e.id ? { ...s, decision: e.decision, by: e.by, resolvedT: e.t } : s,
        ),
      };
    case "run.end":
      return { ...next, status: e.outcome, endT: e.t, summary: e.summary, steps: closeText(run.steps) };
  }
}

export const reduce = (events: readonly RunEvent[]): RunState => events.reduce(step, emptyRun());

function replaceLast(steps: Step[], s: Step): Step[] {
  return [...steps.slice(0, -1), s];
}

function closeText(steps: Step[]): Step[] {
  const last = steps.at(-1);
  return last?.kind === "text" && last.open ? replaceLast(steps, { ...last, open: false }) : steps;
}

function updateTool(
  steps: Step[],
  id: string,
  patch: Partial<ToolStep> | ((s: ToolStep) => Partial<ToolStep>),
): Step[] {
  return steps.map((s) => (s.kind === "tool" && s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s));
}

/** Steps that ran side by side are drawn as one group. */
export type Block = { kind: "single"; step: Step } | { kind: "group"; id: string; steps: ToolStep[] };

export function blocks(steps: readonly Step[]): Block[] {
  const out: Block[] = [];
  for (const s of steps) {
    const last = out.at(-1);
    if (s.kind === "tool" && s.group) {
      if (last?.kind === "group" && last.id === s.group) last.steps.push(s);
      else out.push({ kind: "group", id: s.group, steps: [s] });
    } else out.push({ kind: "single", step: s });
  }
  return out.map((b) => (b.kind === "group" && b.steps.length === 1 && b.steps[0] ? { kind: "single", step: b.steps[0] } : b));
}

/** The gap, in ms, after which a stream with nothing running reads as quiet. */
export const QUIET_MS = 4000;

/** How long a running stream has been silent, or 0 when something is visibly happening. */
export function quietFor(run: RunState, now: number): number {
  if (run.status !== "running") return 0;
  if (run.steps.some((s) => s.kind === "tool" && (s.status === "running" || s.status === "retrying"))) return 0;
  const gap = now - run.lastT;
  return gap >= QUIET_MS ? gap : 0;
}

/** When a step stopped producing anything: its end, its last chunk of text, or its decision. */
export function stepEnd(s: Step): number | undefined {
  if (s.kind === "text") return s.lastT;
  if (s.kind === "tool") return s.endT;
  return s.resolvedT;
}
