import { Status } from "../ui/status";
import { ago, clock } from "./format";
import type { LiveRun } from "./use-runs";

function line(r: LiveRun): string {
  const { state, now } = r;
  if (state.status === "waiting") {
    const ask = state.steps.findLast((s) => s.kind === "approval");
    return `Waiting ${clock(now - (ask?.t ?? now))}`;
  }
  if (state.status === "running") return `Step ${state.steps.length} · ${clock(now)}`;
  const when = ago(now - (state.endT ?? now));
  return state.status === "done" ? `Done ${when}` : state.status === "failed" ? `Failed ${when}` : `Held ${when}`;
}

const GROUPS = [
  { key: "waiting", label: "Waiting on you", has: (r: LiveRun) => r.state.status === "waiting" },
  { key: "running", label: "Running", has: (r: LiveRun) => r.state.status === "running" },
  { key: "finished", label: "Finished", has: (r: LiveRun) => !["waiting", "running"].includes(r.state.status) },
] as const;

/** The whole platform at a glance: what needs you first, then what is moving, then what is over. */
export function RunList({ runs, selected, onSelect }: { runs: LiveRun[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <nav className="list" aria-label="Runs">
      {GROUPS.map((g) => {
        const items = runs.filter(g.has);
        if (items.length === 0) return null;
        return (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <h2 id={`g-${g.key}`} className="sm dim">
              {g.label} <span className="num">{items.length}</span>
            </h2>
            <ul>
              {items.map((r) => (
                <li key={r.script.id}>
                  <button
                    type="button"
                    className="run-item"
                    aria-current={r.script.id === selected ? "true" : undefined}
                    onClick={() => onSelect(r.script.id)}
                    data-s={r.state.status}
                  >
                    <Status s={r.state.status} iconOnly />
                    <span className="t">{r.script.title}</span>
                    <span className="d sm dim num">{line(r)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
