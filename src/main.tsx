import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { RunsStore } from "./app/use-runs";
import { SCRIPTS } from "./run/scripts";
import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/components.css";
import "./app/app.css";

// A link can open the platform at a moment: ?run=renewals&t=40 opens that run 40 s in,
// and &approve answers its approval and plays on another `approve` seconds.
const q = new URLSearchParams(location.search);
const store = new RunsStore(SCRIPTS);
const run = q.get("run") ?? undefined;
store.skip(Number(q.get("t") ?? 0) * 1000);
if (run && q.has("approve")) {
  store.decide(run, "approved");
  const after = Number(q.get("approve"));
  store.skip((after > 0 ? after : 10) * 1000);
}

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");
createRoot(root).render(
  <StrictMode>
    <App store={store} {...(run ? { initialRun: run } : {})} />
  </StrictMode>,
);
