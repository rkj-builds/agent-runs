/**
 * A run is a list of events, the way an agent runtime streams them.
 * Every view (the live stream, the replay, the grade) is built from this list and nothing else,
 * so what you review is exactly what you watched.
 */

export type Table = { columns: string[]; rows: string[][] };

export type ToolResult = {
  /** One line, in plain words: what came back. */
  summary: string;
  table?: Table;
  /** A draft or document the tool produced, shown as text. */
  text?: string;
  /** Something the tool found wrong. Shown with an icon and a label, never colour alone. */
  flag?: string;
};

export type RunEvent =
  | { t: number; type: "run.start"; task: string }
  | { t: number; type: "text"; id: string; delta: string }
  | {
      t: number;
      type: "tool.start";
      id: string;
      name: string;
      args: Record<string, string | number | boolean>;
      /** Calls with the same group were started together and run in parallel. */
      group?: string;
      /** Writes something other people will see. Only allowed after an approval. */
      outward?: boolean;
    }
  | { t: number; type: "tool.progress"; id: string; done: number; total: number; label: string }
  | { t: number; type: "tool.retry"; id: string; reason: string; attempt: number; of: number; waitMs: number }
  | { t: number; type: "tool.end"; id: string; result: ToolResult }
  | { t: number; type: "tool.error"; id: string; error: string }
  | { t: number; type: "approval.request"; id: string; title: string; detail: string; items: string[]; note?: string }
  | { t: number; type: "approval.resolve"; id: string; decision: Decision; by: string }
  | { t: number; type: "run.end"; outcome: Outcome; summary: string };

export type Decision = "approved" | "held";
export type Outcome = "done" | "failed" | "held";
export type RunStatus = "running" | "waiting" | Outcome;

export type TextStep = { kind: "text"; id: string; t: number; lastT: number; text: string; open: boolean };

export type ToolStep = {
  kind: "tool";
  id: string;
  t: number;
  name: string;
  args: Record<string, string | number | boolean>;
  group?: string;
  outward: boolean;
  status: "running" | "retrying" | "ok" | "error";
  endT?: number;
  result?: ToolResult;
  error?: string;
  progress?: { done: number; total: number; label: string };
  retry?: { reason: string; attempt: number; of: number; until: number };
  attempts: number;
};

export type ApprovalStep = {
  kind: "approval";
  id: string;
  t: number;
  title: string;
  detail: string;
  items: string[];
  note?: string;
  decision?: Decision;
  by?: string;
  resolvedT?: number;
};

export type Step = TextStep | ToolStep | ApprovalStep;

export type RunState = {
  task: string;
  status: RunStatus;
  steps: Step[];
  /** Time of the last event, for spotting a stream that has gone quiet. */
  lastT: number;
  endT?: number;
  summary?: string;
};

export type Check = {
  id: string;
  label: string;
  grade: (events: RunEvent[]) => { pass: boolean; stepId?: string; note: string };
};

export type Script = {
  id: string;
  title: string;
  events: RunEvent[];
  checks: Check[];
};
