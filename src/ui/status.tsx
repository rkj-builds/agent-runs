import type { RunStatus } from "../run/types";
import { Check, Clock, Cross, Hand, Pause, Spinner } from "./icons";

export type AnyStatus = RunStatus | "retrying" | "ok" | "error";

const WORD: Record<AnyStatus, string> = {
  running: "Running",
  waiting: "Waiting on you",
  done: "Done",
  failed: "Failed",
  held: "Held",
  retrying: "Retrying",
  ok: "Done",
  error: "Failed",
};

const ICON: Record<AnyStatus, typeof Check> = {
  running: Spinner,
  waiting: Hand,
  done: Check,
  failed: Cross,
  held: Pause,
  retrying: Clock,
  ok: Check,
  error: Cross,
};

const TONE: Record<AnyStatus, RunStatus | "retrying"> = {
  running: "running",
  waiting: "waiting",
  done: "done",
  failed: "failed",
  held: "held",
  retrying: "retrying",
  ok: "done",
  error: "failed",
};

/** A status is always its icon and its word together. `label` replaces the word, never removes it. */
export function Status({ s, label, iconOnly }: { s: AnyStatus; label?: string; iconOnly?: boolean }) {
  const Icon = ICON[s];
  return (
    <span className="status" data-s={TONE[s]}>
      <Icon />
      {iconOnly ? <span className="sr-only">{label ?? WORD[s]}</span> : <span>{label ?? WORD[s]}</span>}
    </span>
  );
}

export const statusWord = (s: AnyStatus) => WORD[s];
