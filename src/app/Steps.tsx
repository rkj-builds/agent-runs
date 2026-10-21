import { useState } from "react";
import { QUIET_MS, blocks, stepEnd } from "../run/reduce";
import type { ApprovalStep, Decision, Step, TextStep, ToolStep } from "../run/types";
import { Alert, Cross, Out, Quiet } from "../ui/icons";
import { Status } from "../ui/status";
import { argLine, clock, timing } from "./format";

type Ctx = {
  now: number;
  live: boolean;
  current?: string;
  pending?: string;
  onDecide?: (d: Decision) => void;
};

export function Steps({ steps, ctx }: { steps: readonly Step[]; ctx: Ctx }) {
  const list = blocks(steps);
  return (
    <ol className="steps">
      {list.map((b, i) => {
        const prev = list[i - 1];
        const first = b.kind === "group" ? b.steps[0] : b.step;
        const prevEnd = prev
          ? prev.kind === "group"
            ? Math.max(...prev.steps.map((s) => s.endT ?? 0))
            : prev.step.kind === "approval"
              ? undefined
              : stepEnd(prev.step)
          : undefined;
        const gap = prevEnd !== undefined && first ? first.t - prevEnd : 0;
        return (
          <li key={b.kind === "group" ? b.id : b.step.id}>
            {gap >= QUIET_MS && (
              <p className="gap sm dim">
                <Quiet /> {Math.round(gap / 1000)} s with no output
              </p>
            )}
            {b.kind === "group" ? <Group steps={b.steps} ctx={ctx} /> : <One step={b.step} ctx={ctx} />}
          </li>
        );
      })}
    </ol>
  );
}

function One({ step, ctx }: { step: Step; ctx: Ctx }) {
  if (step.kind === "text") return <Say step={step} ctx={ctx} />;
  if (step.kind === "tool") return <Tool step={step} ctx={ctx} />;
  return <Ask step={step} ctx={ctx} />;
}

function Say({ step, ctx }: { step: TextStep; ctx: Ctx }) {
  return (
    <p className="say" id={`step-${step.id}`} data-current={ctx.current === step.id || undefined}>
      {step.text}
      {step.open && ctx.live && <span className="caret" aria-hidden="true" />}
    </p>
  );
}

function Group({ steps, ctx }: { steps: ToolStep[]; ctx: Ctx }) {
  const back = steps.filter((s) => s.status === "ok" || s.status === "error").length;
  return (
    <div className="group">
      <p className="sm dim group-head num">
        {steps.length} calls in parallel{back < steps.length ? ` · ${back} of ${steps.length} back` : ""}
      </p>
      {steps.map((s) => (
        <Tool key={s.id} step={s} ctx={ctx} />
      ))}
    </div>
  );
}

function Tool({ step: s, ctx }: { step: ToolStep; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const status = s.status === "ok" ? "ok" : s.status === "error" ? "error" : s.status === "retrying" ? "retrying" : "running";
  const took = (s.endT ?? ctx.now) - s.t;
  const hasBody = Boolean(s.result?.table ?? s.result?.text) || Object.keys(s.args).length > 0;
  return (
    <div className="tool" id={`step-${s.id}`} data-current={ctx.current === s.id || undefined} data-status={s.status}>
      <button type="button" className="tool-head" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!hasBody}>
        <Status s={status} iconOnly />
        <span className="mono name">{s.name}</span>
        {s.outward && (
          <span className="outward sm">
            <Out /> outward
          </span>
        )}
        <span className="mono dim args">{argLine(s.args)}</span>
        <span className="num dim sm took">{timing(took)}</span>
      </button>
      <div className="tool-lines">
        {s.result && (
          <p className="sm muted">
            {s.result.summary}
            {s.attempts > 1 && <span className="dim"> · after {s.attempts} attempts</span>}
          </p>
        )}
        {s.result?.flag && (
          <p className="flag sm" data-tone="warn">
            <Alert /> <span>{s.result.flag}</span>
          </p>
        )}
        {s.status === "retrying" && s.retry && (
          <p className="sm retry num">
            {s.retry.reason}.{" "}
            {ctx.live && s.retry.until > ctx.now
              ? `Trying again in ${Math.ceil((s.retry.until - ctx.now) / 1000)} s`
              : "Trying again"}{" "}
            · attempt {s.retry.attempt} of {s.retry.of}
          </p>
        )}
        {s.status === "error" && (
          <p className="flag sm" data-tone="err">
            <Cross /> <span>{s.error}</span>
          </p>
        )}
        {s.progress && s.status === "running" && (
          <div className="prog">
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={s.progress.total} aria-valuenow={s.progress.done} aria-label={s.progress.label}>
              <span style={{ width: `${(100 * s.progress.done) / s.progress.total}%` }} />
            </div>
            <span className="sm dim num">
              {s.progress.done} of {s.progress.total} {s.progress.label}
            </span>
          </div>
        )}
      </div>
      {open && (
        <div className="tool-body">
          <dl className="mono sm">
            {Object.entries(s.args).map(([k, v]) => (
              <div key={k}>
                <dt className="dim">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
          {s.result?.table && (
            <div className="table-wrap">
              <table className="sm">
                <thead>
                  <tr>
                    {s.result.table.columns.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.result.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {s.result?.text && <blockquote className="draft">{s.result.text}</blockquote>}
        </div>
      )}
    </div>
  );
}

function Ask({ step: s, ctx }: { step: ApprovalStep; ctx: Ctx }) {
  const waiting = !s.decision;
  const liveAsk = waiting && ctx.live && ctx.pending === s.id;
  return (
    <section className="ask" id={`step-${s.id}`} data-current={ctx.current === s.id || undefined} data-open={waiting || undefined} aria-label={s.title}>
      <p className="ask-top sm">
        {waiting ? (
          <>
            <Status s="waiting" /> <span className="dim num">for {clock(ctx.now - s.t)}</span>
          </>
        ) : (
          <Status
            s={s.decision === "approved" ? "done" : "held"}
            label={`${s.decision === "approved" ? "Approved" : "Held"} by ${s.by ?? "you"}, after ${clock((s.resolvedT ?? s.t) - s.t)}`}
          />
        )}
      </p>
      <h2>{s.title}</h2>
      <p className="muted">{s.detail}</p>
      {s.note && (
        <p className="flag sm" data-tone="warn">
          <Alert /> <span>{s.note}</span>
        </p>
      )}
      <ul className="items">
        {s.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
      {liveAsk && ctx.onDecide && (
        <div className="actions">
          <button type="button" className="btn" data-variant="primary" onClick={() => ctx.onDecide?.("approved")}>
            Approve
          </button>
          <button type="button" className="btn" onClick={() => ctx.onDecide?.("held")}>
            Hold
          </button>
        </div>
      )}
    </section>
  );
}
