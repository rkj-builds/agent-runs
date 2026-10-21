import { describe, expect, it } from "vitest";
import { LivePlayer } from "./player";
import { QUIET_MS, blocks, quietFor, reduce } from "./reduce";
import { SCRIPTS } from "./scripts";
import type { RunEvent } from "./types";

const script = (id: string) => SCRIPTS.find((s) => s.id === id)!;

describe("reduce", () => {
  it("joins streamed text into one step and closes it when a tool starts", () => {
    const run = reduce(script("renewals").events.filter((e) => e.t < 3000));
    const [text, tool] = run.steps;
    expect(text).toMatchObject({ kind: "text", open: false });
    expect(text?.kind === "text" && text.text).toMatch(/^I'll read the register/);
    expect(tool).toMatchObject({ kind: "tool", name: "query_register" });
  });

  it("is waiting while an approval is open, and running again after it", () => {
    const events = script("renewals").events;
    const ask = events.findIndex((e) => e.type === "approval.request");
    expect(reduce(events.slice(0, ask + 1)).status).toBe("waiting");
    expect(reduce(events.slice(0, ask + 2)).status).toBe("running");
  });

  it("ends every script with the outcome it states", () => {
    const outcomes = Object.fromEntries(SCRIPTS.map((s) => [s.id, reduce(s.events).status]));
    expect(outcomes).toEqual({ renewals: "done", report: "done", cash: "failed", clashes: "done", weekend: "held" });
  });

  it("marks a retried call as retrying, then ok", () => {
    const events = script("report").events;
    const retry = events.find((e) => e.type === "tool.retry")!;
    const at = reduce(events.filter((e) => e.t <= retry.t));
    const tool = at.steps.find((s) => s.kind === "tool" && s.name === "fetch_payments");
    expect(tool).toMatchObject({ status: "retrying", attempts: 2 });
    expect(reduce(events).steps.find((s) => s.kind === "tool" && s.name === "fetch_payments")).toMatchObject({ status: "ok" });
  });

  it("draws parallel calls as one group", () => {
    const b = blocks(reduce(script("renewals").events).steps);
    const group = b.find((x) => x.kind === "group");
    expect(group?.kind === "group" && group.steps.map((s) => s.args.parent)).toEqual(["Meera", "Kabir", "Ananya", "Rohan"]);
  });
});

describe("quietFor", () => {
  it("is zero while a tool is visibly running", () => {
    const run = reduce(script("renewals").events.slice(0, 40).filter((e) => e.type !== "tool.end"));
    expect(quietFor(run, run.lastT + 60_000)).toBe(0);
  });

  it("counts silence once nothing is happening", () => {
    const events: RunEvent[] = [
      { t: 0, type: "run.start", task: "x" },
      { t: 100, type: "text", id: "a", delta: "hi" },
    ];
    const run = reduce(events);
    expect(quietFor(run, 100 + QUIET_MS - 1)).toBe(0);
    expect(quietFor(run, 100 + QUIET_MS + 500)).toBe(QUIET_MS + 500);
  });
});

describe("LivePlayer", () => {
  it("stops at an approval until someone decides", () => {
    const p = new LivePlayer(script("renewals").events);
    p.advance(10 * 60_000);
    expect(p.pending).toBeDefined();
    expect(reduce(p.played).status).toBe("waiting");
    expect(p.finished).toBe(false);
  });

  it("carries on from the moment of an approval", () => {
    const p = new LivePlayer(script("renewals").events);
    p.advance(10 * 60_000);
    p.decide("approved", 10 * 60_000);
    p.advance(10 * 60_000 + 1000);
    expect(p.finished).toBe(false);
    p.advance(10 * 60_000 + 60_000);
    const run = reduce(p.played);
    expect(run.status).toBe("done");
    const approval = run.steps.find((s) => s.kind === "approval");
    expect(approval).toMatchObject({ decision: "approved", by: "you", resolvedT: 10 * 60_000 });
  });

  it("ends a held run at once, with nothing outward", () => {
    const p = new LivePlayer(script("renewals").events);
    p.advance(10 * 60_000);
    p.decide("held", 10 * 60_000);
    const run = reduce(p.played);
    expect(run.status).toBe("held");
    expect(p.played.some((e) => e.type === "tool.start" && e.outward)).toBe(false);
  });

  it("replays recorded decisions for runs that finished earlier", () => {
    const p = new LivePlayer(script("weekend").events, true);
    p.advance(Number.POSITIVE_INFINITY);
    expect(reduce(p.played).status).toBe("held");
  });
});

describe("grades", () => {
  const grade = (id: string, events = script(id).events) => script(id).checks.map((c) => ({ id: c.id, ...c.grade(events) }));

  it("fails the first draft and passes the rest on the renewal run", () => {
    const g = grade("renewals");
    expect(g.map((c) => [c.id, c.pass])).toEqual([
      ["checked", true],
      ["first-pass", false],
      ["told", true],
      ["gate", true],
      ["names", true],
    ]);
    expect(g.find((c) => c.id === "first-pass")?.note).toMatch(/₹11,996/);
  });

  it("points every check that has a step at a step that exists", () => {
    for (const s of SCRIPTS) {
      const ids = new Set(reduce(s.events).steps.map((x) => x.id));
      for (const c of s.checks) {
        const { stepId } = c.grade(s.events);
        if (stepId) expect(ids, `${s.id}/${c.id}`).toContain(stepId);
      }
    }
  });

  it("fails the gate when an outward call runs before approval", () => {
    const events = script("renewals").events;
    const send = events.find((e) => e.type === "tool.start" && e.outward)!;
    const early = [...events.filter((e) => e !== send), { ...send, t: 0 }].sort((a, b) => a.t - b.t);
    expect(grade("renewals", early).find((c) => c.id === "gate")?.pass).toBe(false);
  });

  it("fails the cash run on finishing, passes it on stopping safely", () => {
    expect(grade("cash").map((c) => c.pass)).toEqual([false, true, true]);
  });
});
