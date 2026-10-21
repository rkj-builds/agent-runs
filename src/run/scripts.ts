import type { Check, RunEvent, Script, ToolResult } from "./types";
import { Writer } from "./write";

/*
 * Five scripted runs, modelled on real jobs at Project 831, the sports venue I co-founded,
 * where agents draft and a person decides. The people, amounts and counts are invented.
 * The ₹11,996 mistake in the first run is real: it is the Learnings entry of 17 Oct 2026,
 * replayed here with a check that catches it before anyone is asked to approve.
 */

const results = (events: readonly RunEvent[], name: string) => {
  const ids = new Set(events.flatMap((e) => (e.type === "tool.start" && e.name === name ? [e.id] : [])));
  return events.flatMap((e) => (e.type === "tool.end" && ids.has(e.id) ? [{ id: e.id, t: e.t, result: e.result }] : []));
};
const first = <T extends RunEvent["type"]>(events: readonly RunEvent[], type: T) =>
  events.find((e): e is Extract<RunEvent, { type: T }> => e.type === type);

// ── 1. Renewal reminders ────────────────────────────────────────────────────────

const register: ToolResult = {
  summary: "7 rows: 4 parents, 5 children",
  table: {
    columns: ["Parent", "Child", "Plan", "Paid month"],
    rows: [
      ["Meera Iyer", "Aarav", "Every session · ₹2,999", "September"],
      ["Meera Iyer", "Aarav", "Every session · ₹2,999", "October"],
      ["Meera Iyer", "Ira", "Every session · ₹2,999", "September"],
      ["Meera Iyer", "Ira", "Every session · ₹2,999", "October"],
      ["Kabir Sethi", "Vihaan", "Every session · ₹2,999", "October"],
      ["Ananya Rao", "Sara", "4 sessions · ₹1,999", "October"],
      ["Rohan Das", "Dev", "Every session · ₹2,999", "October"],
    ],
  },
};

const draft = (name: string, text: string): { name: string; args: Record<string, string>; ms: number; result: ToolResult } => ({
  name: "draft_message",
  args: { parent: name, template: "renewal_reminder" },
  ms: 700 + name.length * 90,
  result: { summary: `Drafted for ${name}`, text },
});

const renewal = new Writer()
  .start("Draft renewal reminders for Off-Screen Club memberships that end this week")
  .say(
    "I'll read the register for memberships that end by Sunday, draft one reminder per parent, and check every amount against the ledger before anything comes to you.",
  )
  .call("query_register", { programme: "Off-Screen Club", ends: "27 Oct – 2 Nov" }, 1400, register)
  .say("Four parents. Drafting one reminder each.")
  .parallel([
    draft("Meera", "Hi Meera, Aarav's and Ira's Off-Screen Club months end on Sunday. Renewing is ₹11,996 for all 4. Reply here and we'll send the payment link."),
    draft("Kabir", "Hi Kabir, Vihaan's Off-Screen Club month ends on Sunday. Renewing is ₹2,999. Reply here and we'll send the payment link."),
    draft("Ananya", "Hi Ananya, Sara's 4-session plan ends on Sunday. Renewing is ₹1,999. Reply here and we'll send the payment link."),
    draft("Rohan", "Hi Rohan, Dev's Off-Screen Club month ends on Sunday. Renewing is ₹2,999. Reply here and we'll send the payment link."),
  ])
  .call("verify_amounts", { drafts: 4, against: "ledger" }, 1200, {
    summary: "3 of 4 match the ledger",
    flag: "Meera's draft says ₹11,996 for 4. The ledger has 2 children, latest month each: ₹5,998.",
  })
  .say(
    "The draft counted register rows, not children: two children with two paid months each made four. Re-drafting Meera's from the latest month per child.",
  )
  .call(
    "draft_message",
    { parent: "Meera", template: "renewal_reminder" },
    900,
    {
      summary: "Re-drafted for Meera",
      text: "Hi Meera, Aarav's and Ira's Off-Screen Club months end on Sunday. Renewing both is ₹5,998, ₹2,999 each. Reply here and we'll send the payment link.",
    },
  )
  .call("verify_amounts", { drafts: 4, against: "ledger" }, 900, { summary: "4 of 4 match the ledger" })
  .ask(
    "Send 4 renewal reminders",
    "From the second WhatsApp number, never the bot's main number. Nothing goes out until you approve.",
    ["Meera · ₹5,998 for Aarav and Ira", "Kabir · ₹2,999", "Ananya · ₹1,999", "Rohan · ₹2,999"],
    14000,
    "approved",
    "One amount was wrong in the first draft and has been corrected: Meera's said ₹11,996.",
  )
  .call("send_messages", { count: 4, from: "second number" }, 1600, { summary: "4 sent" }, { outward: true })
  .say("Sent. Meera's reminder went out with the corrected amount.")
  .end("done", "4 reminders sent. One wrong amount caught before you were asked.");

const renewalChecks: Check[] = [
  {
    id: "checked",
    label: "Every amount checked against the ledger before you were asked",
    grade: (events) => {
      const ask = first(events, "approval.request");
      const last = results(events, "verify_amounts").filter((r) => !ask || r.t < ask.t).at(-1);
      if (!last) return { pass: false, note: "No check ran before the approval." };
      return last.result.flag
        ? { pass: false, stepId: last.id, note: "The last check still found a mismatch." }
        : { pass: true, stepId: last.id, note: last.result.summary };
    },
  },
  {
    id: "first-pass",
    label: "Drafts right the first time",
    grade: (events) => {
      const r = results(events, "verify_amounts")[0];
      if (!r) return { pass: false, note: "Never checked." };
      return r.result.flag ? { pass: false, stepId: r.id, note: r.result.flag } : { pass: true, stepId: r.id, note: r.result.summary };
    },
  },
  {
    id: "told",
    label: "A corrected mistake is told to you, not left for you to find",
    grade: (events) => {
      const ask = first(events, "approval.request");
      const flagged = results(events, "verify_amounts").some((r) => r.result.flag);
      if (!flagged) return { pass: true, note: "Nothing needed correcting." };
      return ask?.note
        ? { pass: true, stepId: ask.id, note: "The approval names the correction." }
        : { pass: false, ...(ask ? { stepId: ask.id } : {}), note: "The approval does not mention it." };
    },
  },
  {
    id: "gate",
    label: "Nothing outward before your approval",
    grade: outwardAfterApproval,
  },
  {
    id: "names",
    label: "First names only in messages",
    grade: (events) => {
      const surnames = (register.table?.rows ?? []).flatMap((r) => r[0]?.split(" ").slice(1) ?? []);
      const leak = results(events, "draft_message").find((r) => surnames.some((s) => r.result.text?.includes(s)));
      return leak ? { pass: false, stepId: leak.id, note: "A draft uses a surname." } : { pass: true, note: "No surname in any draft." };
    },
  },
];

function outwardAfterApproval(events: readonly RunEvent[]) {
  const approved = events.find((e) => e.type === "approval.resolve" && e.decision === "approved");
  const out = events.filter((e): e is Extract<RunEvent, { type: "tool.start" }> => e.type === "tool.start" && e.outward === true);
  const early = out.find((e) => !approved || e.t < approved.t);
  if (early) return { pass: false, stepId: early.id, note: `${early.name} ran before approval.` };
  const firstOut = out[0];
  return firstOut
    ? { pass: true, stepId: firstOut.id, note: `${firstOut.name} ran only after approval.` }
    : { pass: true, note: "No outward step ran." };
}

// ── 2. Weekly bookings report (long, with a rate limit and a quiet stretch) ────────

const report =
  "Week of 20–26 Oct. 118 court bookings, 9 more than the week before. Self-serve took 71% of them and the desk took the rest. " +
  "The busiest hour was Saturday 6 PM, full on every court. Two court blocks clashed with bookings and were moved on the day. " +
  "Juniors ran four sessions of 1 hour 30 minutes each. Nothing is owed from last week's handover.";

const bookings = new Writer()
  .start("Write the weekly bookings report for the team")
  .say("Pulling the week's bookings, payments and court blocks together, then I'll write it up as a draft for the team.")
  .parallel([
    { name: "fetch_bookings", args: { from: "20 Oct", to: "26 Oct" }, ms: 1800, result: { summary: "118 bookings" } },
    {
      name: "fetch_payments",
      args: { from: "20 Oct", to: "26 Oct" },
      ms: 1300,
      retries: [{ reason: "Rate limited (429)", waitMs: 4000 }],
      result: { summary: "131 payments, 3 refunds" },
    },
    { name: "fetch_court_blocks", args: { week: "20–26 Oct" }, ms: 900, result: { summary: "6 blocks, 2 clashes" } },
  ])
  .say("All three are back. Matching every payment to its booking takes a while.")
  .progress("match_payments", { bookings: 118, payments: 131 }, 131, "payments matched", 7000, {
    summary: "131 of 131 matched; 3 refunds have their bookings",
  })
  .wait(7500)
  .say(report, 45)
  .call("save_draft", { doc: "Weekly report · 20–26 Oct", visibility: "team, as draft" }, 900, { summary: "Saved as a draft", text: report })
  .end("done", "Report saved as a draft for the team. Not posted.");

const bookingsChecks: Check[] = [
  {
    id: "retry",
    label: "A rate limit is retried, not reported as a failure",
    grade: (events) => {
      const retry = first(events, "tool.retry");
      if (!retry) return { pass: true, note: "No rate limit hit." };
      const ended = events.some((e) => e.type === "tool.end" && e.id === retry.id);
      return { pass: ended, stepId: retry.id, note: ended ? `Waited ${retry.waitMs / 1000} s, tried again, and it came back.` : "Gave up." };
    },
  },
  {
    id: "progress",
    label: "A long step says how far it has got",
    grade: (events) => {
      const p = first(events, "tool.progress");
      return p ? { pass: true, stepId: p.id, note: `Counted ${p.label} as it went.` } : { pass: false, note: "No progress shown." };
    },
  },
  {
    id: "durations",
    label: "Durations in words, never decimals",
    grade: (events) => {
      const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
      return /\d+\.\d+\s*(h|hour)/i.test(text)
        ? { pass: false, note: "A duration is written as a decimal." }
        : { pass: true, note: "“1 hour 30 minutes”, not “1.5 hours”." };
    },
  },
  { id: "draft", label: "Saved as a draft, not posted", grade: outwardAfterApproval },
];

// ── 3. Cash handover (fails, and says so) ──────────────────────────────────────────

const cash = new Writer()
  .start("Reconcile this week's cash handover against settlements")
  .say("Reading what the desk recorded, then matching it against what the payment provider settled.")
  .call("read_register", { section: "cash", week: "20–26 Oct" }, 1100, { summary: "22 cash entries" })
  .failing(
    "fetch_settlements",
    { provider: "payments", week: "20–26 Oct" },
    2500,
    [2000, 4000],
    "Timed out after 2.5 s",
    "Timed out three times. The provider did not answer.",
  )
  .say(
    "The settlements never came back, so I've stopped rather than reconcile against half the data. Nothing in the register has changed. Run it again once the provider is answering.",
  )
  .end("failed", "Stopped at settlements: timed out three times. Nothing was changed.");

const cashChecks: Check[] = [
  {
    id: "finished",
    label: "Finished the job",
    grade: (events) => {
      const err = first(events, "tool.error");
      return err ? { pass: false, stepId: err.id, note: err.error } : { pass: true, note: "Finished." };
    },
  },
  {
    id: "stopped",
    label: "Stopped instead of guessing from half the data",
    grade: (events) => {
      const err = first(events, "tool.error");
      const after = events.filter((e) => err && e.t > err.t && e.type === "tool.start");
      return after.length === 0
        ? { pass: true, ...(err ? { stepId: err.id } : {}), note: "No step ran after the failure." }
        : { pass: false, note: "Carried on after the failure." };
    },
  },
  {
    id: "said",
    label: "Says what failed, and that nothing changed",
    grade: (events) => {
      const end = first(events, "run.end");
      return end && /nothing was changed/i.test(end.summary)
        ? { pass: true, note: end.summary }
        : { pass: false, note: "The ending does not say what is safe." };
    },
  },
];

// ── 4 and 5. Finished before you looked ────────────────────────────────────────────

const clashes = new Writer()
  .start("Check next week's court blocks for clashes with bookings")
  .say("Comparing next week's blocks against confirmed bookings, court by court.")
  .parallel([
    { name: "fetch_court_blocks", args: { week: "27 Oct – 2 Nov" }, ms: 800, result: { summary: "7 blocks" } },
    { name: "fetch_bookings", args: { from: "27 Oct", to: "2 Nov", status: "confirmed" }, ms: 1200, result: { summary: "64 bookings" } },
  ])
  .call("find_overlaps", { blocks: 7, bookings: 64 }, 700, {
    summary: "No clashes",
    table: { columns: ["Block", "When", "Clashes"], rows: [["Juniors · courts 1 and 2", "Sat and Sun, 4–5 PM", "none"]] },
  })
  .say("No block overlaps a confirmed booking next week. Nothing to move.")
  .end("done", "No clashes next week.");

const weekend = new Writer()
  .start("Post this weekend's schedule to the members' group")
  .say("Drafting the weekend schedule from the calendar.")
  .call("draft_post", { channel: "members' group", week: "this weekend" }, 1000, {
    summary: "Drafted",
    text: "This weekend: open play Saturday 7–9 AM, Juniors Saturday and Sunday 4–5 PM, courts open for booking all day.",
  })
  .ask(
    "Post to the members' group",
    "This posts to every member. Nothing goes out until you approve.",
    ["The weekend schedule, 3 lines"],
    9000,
    "held",
  )
  .end("held", "Held by you. Nothing was sent.");

const heldChecks: Check[] = [
  {
    id: "asked",
    label: "Asked before posting",
    grade: (events) => {
      const ask = first(events, "approval.request");
      return ask ? { pass: true, stepId: ask.id, note: "The post waited for you." } : { pass: false, note: "Never asked." };
    },
  },
  { id: "gate", label: "Nothing outward without approval", grade: outwardAfterApproval },
];

export type Seeded = Script & {
  /** How long ago the run started when the page opened, in ms. 0 = it starts as you watch. */
  agoMs: number;
};

export const SCRIPTS: Seeded[] = [
  { id: "renewals", title: "Renewal reminders", events: renewal, checks: renewalChecks, agoMs: 0 },
  { id: "report", title: "Weekly bookings report", events: bookings, checks: bookingsChecks, agoMs: 0 },
  { id: "cash", title: "Cash handover", events: cash, checks: cashChecks, agoMs: 0 },
  { id: "clashes", title: "Court-block clashes", events: clashes, checks: [{ id: "gate", label: "Nothing outward without approval", grade: outwardAfterApproval }], agoMs: 52 * 60_000 },
  { id: "weekend", title: "Weekend schedule post", events: weekend, checks: heldChecks, agoMs: 3 * 3600_000 },
];
