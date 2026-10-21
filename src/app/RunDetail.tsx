import { useEffect, useState } from "react";
import { quietFor, reduce } from "../run/reduce";
import type { Decision } from "../run/types";
import { Quiet } from "../ui/icons";
import { Status } from "../ui/status";
import { Grade } from "./Grade";
import { Steps } from "./Steps";
import { clock, plural } from "./format";
import type { LiveRun } from "./use-runs";

/** The id an event belongs to, so the replay can say which step it is on. */
const idOf = (e: LiveRun["events"][number]) => ("id" in e ? e.id : undefined);

export function RunDetail({ run, onDecide }: { run: LiveRun; onDecide: (d: Decision) => void }) {
  const finished = !["running", "waiting"].includes(run.state.status);
  // In replay, the run is shown as it stood after event `at`. null = the end (or live).
  const [at, setAt] = useState<number | null>(null);
  const last = run.events.length - 1;
  const index = finished && at !== null ? Math.min(at, last) : last;
  const replaying = finished && at !== null && at < last;
  const shown = replaying ? reduce(run.events.slice(0, index + 1)) : run.state;
  const shownNow = replaying ? (run.events[index]?.t ?? 0) : finished ? (run.state.endT ?? run.now) : run.now;
  const at_ = run.events[index];
  const current = replaying && at_ ? idOf(at_) : undefined;
  const tools = shown.steps.filter((s) => s.kind === "tool").length;
  const quiet = finished ? 0 : quietFor(run.state, run.now);

  useEffect(() => {
    if (!current) return;
    document.getElementById(`step-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const showStep = (stepId: string) => {
    const i = run.events.findLastIndex((e) => idOf(e) === stepId);
    if (i >= 0) setAt(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!finished || e.target instanceof HTMLInputElement) return;
    if (e.key === "j" || e.key === "ArrowDown") setAt(Math.min(index + 1, last));
    else if (e.key === "k" || e.key === "ArrowUp") setAt(Math.max(index - 1, 0));
    else return;
    e.preventDefault();
  };

  return (
    // The keyboard shortcuts (j and k) belong to the whole run, so the run's region takes focus for them.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <article className="detail" aria-labelledby="run-h" onKeyDown={onKey}>
      <header className="run-head">
        <p className="sm dim">{run.script.title}</p>
        <h1 id="run-h">{run.state.task}</h1>
        <p className="meta sm">
          <Status s={shown.status} />
          <span className="dim num">{clock(shown.endT ?? shownNow)}</span>
          <span className="dim num">
            {plural(shown.steps.length, "step")} · {plural(tools, "tool call")}
          </span>
        </p>
      </header>

      {finished && (
        <div className="replay" role="group" aria-label="Replay">
          <label className="sm muted" htmlFor="scrub">
            Replay
          </label>
          <input
            id="scrub"
            type="range"
            min={0}
            max={last}
            value={index}
            onChange={(e) => setAt(Number(e.target.value))}
            aria-valuetext={`Event ${index + 1} of ${last + 1}, at ${clock(shownNow)}`}
          />
          <span className="sm dim num">{clock(shownNow)}</span>
          <span className="sm dim keys">
            <span className="kbd">j</span> <span className="kbd">k</span> to step
          </span>
          {replaying && (
            <button type="button" className="btn" data-variant="ghost" onClick={() => setAt(null)}>
              To the end
            </button>
          )}
        </div>
      )}

      <div className="detail-cols">
        <div className="stream">
          <Steps
            steps={shown.steps}
            ctx={{ now: shownNow, live: !finished, ...(current ? { current } : {}), ...(run.pending ? { pending: run.pending } : {}), onDecide }}
          />
          {quiet > 0 && (
            <p className="quiet sm" role="status">
              <Quiet /> No new output for {Math.floor(quiet / 1000)} s. Still running; nothing has failed.
            </p>
          )}
          {shown.summary && (
            <p className="end">
              <Status s={shown.status} /> <span>{shown.summary}</span>
            </p>
          )}
        </div>
        {finished && <Grade checks={run.script.checks} events={run.events} onShow={showStep} />}
      </div>
    </article>
  );
}
