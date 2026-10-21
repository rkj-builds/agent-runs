import { act, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCRIPTS } from "../run/scripts";
import { App } from "./App";
import { RunsStore } from "./use-runs";

const play = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const runButton = (name: RegExp) => within(screen.getByRole("navigation", { name: "Runs" })).getByRole("button", { name });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the live view", () => {
  it("puts the run that needs you first, and waits for you", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    play(40_000);
    expect(screen.getByRole("heading", { name: /Waiting on you/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 waiting on you" })).toBeInTheDocument();
    const ask = screen.getByRole("region", { name: "Send 4 renewal reminders" });
    expect(within(ask).getByText(/Meera's said ₹11,996/)).toBeInTheDocument();
    // However long you take, nothing goes out on its own.
    play(10 * 60_000);
    expect(screen.queryByText(/send_messages/)).not.toBeInTheDocument();
  });

  it("sends after you approve, then grades the run", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    play(40_000);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    play(10_000);
    expect(screen.getByText("send_messages")).toBeInTheDocument();
    expect(screen.getByText("4 reminders sent. One wrong amount caught before you were asked.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Grade 4 of 5 passed/ })).toBeInTheDocument();
  });

  it("ends a held run with nothing sent", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    play(40_000);
    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    play(10_000);
    expect(screen.getAllByText("Held by you. Nothing was sent.").length).toBeGreaterThan(0);
    expect(screen.queryByText("send_messages")).not.toBeInTheDocument();
  });

  it("says a quiet stream is still running", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    fireEvent.click(runButton(/Weekly bookings report/));
    const matched = SCRIPTS.find((s) => s.id === "report")!.events.find((e) => e.type === "tool.end" && e.result.summary.startsWith("131 of 131"))!;
    play(matched.t + 6000);
    expect(screen.getByText(/No new output for \d s\. Still running; nothing has failed\./)).toBeInTheDocument();
  });

  it("counts down a retry", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    fireEvent.click(runButton(/Weekly bookings report/));
    const retry = SCRIPTS.find((s) => s.id === "report")!.events.find((e) => e.type === "tool.retry")!;
    play(retry.t + 1000);
    expect(screen.getByText(/Rate limited \(429\)\. Trying again in 3 s · attempt 2 of 2/)).toBeInTheDocument();
  });
});

describe("the review", () => {
  it("jumps from a failed check to the step that decided it", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    play(40_000);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    play(10_000);
    const grade = screen.getByRole("region", { name: /Grade/ });
    const failed = within(grade).getByText("Drafts right the first time").closest("li")!;
    fireEvent.click(within(failed).getByRole("button", { name: "Show the step" }));
    // The replay is back before the re-draft, so the run reads as it did then.
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("Re-drafted for Meera")).not.toBeInTheDocument();
    expect(document.querySelector("[data-current]")?.textContent).toMatch(/verify_amounts/);
    fireEvent.click(screen.getByRole("button", { name: "To the end" }));
    expect(screen.getByText("Re-drafted for Meera")).toBeInTheDocument();
  });

  it("steps through a finished run with j and k", () => {
    render(<App store={new RunsStore(SCRIPTS)} />);
    fireEvent.click(runButton(/Court-block clashes/));
    const scrub = screen.getByRole("slider");
    const end = Number(scrub.getAttribute("max"));
    expect(Number((scrub as HTMLInputElement).value)).toBe(end);
    const article = screen.getByRole("article");
    fireEvent.keyDown(article, { key: "k" });
    fireEvent.keyDown(article, { key: "k" });
    expect(Number((scrub as HTMLInputElement).value)).toBe(end - 2);
    fireEvent.keyDown(article, { key: "j" });
    expect(Number((scrub as HTMLInputElement).value)).toBe(end - 1);
  });
});

describe("accessibility", () => {
  it("has no axe violations, live and in review", async () => {
    vi.useRealTimers();
    const store = new RunsStore(SCRIPTS);
    const { container } = render(<App store={store} />);
    const run = async () => (await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations;
    expect(await run()).toEqual([]);
    fireEvent.click(runButton(/Weekend schedule post/));
    expect(await run()).toEqual([]);
  });
});
