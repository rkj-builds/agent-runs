import { useEffect, useRef, useState } from "react";
import { SCRIPTS } from "../run/scripts";
import type { RunStatus } from "../run/types";
import { statusWord } from "../ui/status";
import { RunDetail } from "./RunDetail";
import { RunList } from "./RunList";
import { RunsStore, useRuns } from "./use-runs";

const SPEEDS = [1, 2, 4];

export function App({ store: given, initialRun }: { store?: RunsStore; initialRun?: string }) {
  const [store] = useState(() => given ?? new RunsStore(SCRIPTS));
  const { runs, speed } = useRuns(store);
  const [selected, setSelected] = useState(initialRun ?? runs[0]?.script.id ?? "");
  const [compact, setCompact] = useState(false);
  const run = runs.find((r) => r.script.id === selected) ?? runs[0];
  const waiting = runs.filter((r) => r.state.status === "waiting").length;

  // Say out loud when a run changes state; never once per word of streamed text.
  const [said, setSaid] = useState("");
  const seen = useRef(new Map<string, RunStatus>());
  useEffect(() => {
    for (const r of runs) {
      const was = seen.current.get(r.script.id);
      if (was && was !== r.state.status) setSaid(`${r.script.title}: ${statusWord(r.state.status).toLowerCase()}.`);
      seen.current.set(r.script.id, r.state.status);
    }
  }, [runs]);

  return (
    <div className="app" data-density={compact ? "compact" : undefined}>
      <header className="bar">
        <p className="brand">Agent runs</p>
        {waiting > 0 ? (
          <button type="button" className="pill" onClick={() => setSelected(runs.find((r) => r.state.status === "waiting")?.script.id ?? selected)}>
            {waiting} waiting on you
          </button>
        ) : (
          <span className="pill" data-quiet>
            Nothing waiting on you
          </span>
        )}
        <div className="bar-end">
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className="btn" aria-pressed={speed === s} onClick={() => store.setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <button type="button" className="btn" aria-pressed={compact} onClick={() => setCompact((c) => !c)}>
            Compact
          </button>
          <button type="button" className="btn" data-variant="ghost" onClick={store.reset}>
            Restart
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className="side">
          <RunList runs={runs} selected={run?.script.id ?? ""} onSelect={setSelected} />
          <p className="note sm dim">
            A working prototype. The runs are scripted, so they play the same way every time, and no model is called. The jobs
            are modelled on real ones at Project 831; the people and amounts are invented. <a href="../case/run-view.html">About this</a>
          </p>
        </aside>
        <main className="main">{run && <RunDetail key={run.script.id} run={run} onDecide={(d) => store.decide(run.script.id, d)} />}</main>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
