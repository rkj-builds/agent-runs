import type { Check, RunEvent } from "../run/types";
import { Status } from "../ui/status";

/** Grades a finished run against its checks. Each check points at the step where it was decided. */
export function Grade({ checks, events, onShow }: { checks: Check[]; events: RunEvent[]; onShow: (stepId: string) => void }) {
  const graded = checks.map((c) => ({ c, g: c.grade(events) }));
  const passed = graded.filter((x) => x.g.pass).length;
  return (
    <section className="grade" aria-labelledby="grade-h">
      <h2 id="grade-h">
        Grade <span className="num muted">{passed} of {checks.length} passed</span>
      </h2>
      <ul>
        {graded.map(({ c, g }) => (
          <li key={c.id}>
            <Status s={g.pass ? "ok" : "error"} iconOnly label={g.pass ? "Passed" : "Failed"} />
            <div>
              <p>{c.label}</p>
              <p className="sm dim">{g.note}</p>
              {g.stepId !== undefined && (
                <button type="button" className="link sm" onClick={() => onShow(g.stepId ?? "")}>
                  Show the step
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
