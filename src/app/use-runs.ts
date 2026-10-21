import { useSyncExternalStore } from "react";
import { LivePlayer } from "../run/player";
import { reduce } from "../run/reduce";
import type { Seeded } from "../run/scripts";
import type { Decision, RunEvent, RunState } from "../run/types";

export type LiveRun = {
  script: Seeded;
  events: RunEvent[];
  state: RunState;
  /** The run's own clock: ms since it started. */
  now: number;
  pending?: string;
};

export type Snapshot = { vt: number; speed: number; runs: LiveRun[] };

/**
 * Every run plays at once against one clock, as they would on a real platform.
 * The clock moves in fixed ticks, so a script plays the same way at any speed, and in tests.
 */
export class RunsStore {
  private players: LivePlayer[] = [];
  private vt = 0;
  private speed = 1;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly listeners = new Set<() => void>();
  private snap!: Snapshot;

  constructor(
    private readonly scripts: readonly Seeded[],
    private readonly tick = 50,
  ) {
    this.reset();
  }

  reset = (): void => {
    this.vt = 0;
    this.players = this.scripts.map((s) => {
      const p = new LivePlayer(s.events, s.agoMs > 0);
      p.advance(s.agoMs);
      return p;
    });
    this.emit();
  };

  /** Moves the clock forward at once: for links that open a run at a given moment. */
  skip = (ms: number): void => {
    this.vt += ms;
    this.players.forEach((p, i) => p.advance(this.vt + (this.scripts[i]?.agoMs ?? 0)));
    this.emit();
  };

  setSpeed = (speed: number): void => {
    this.speed = speed;
    this.emit();
  };

  decide = (id: string, decision: Decision): void => {
    const i = this.scripts.findIndex((s) => s.id === id);
    const p = this.players[i];
    const script = this.scripts[i];
    if (!p || !script) return;
    const now = this.vt + script.agoMs;
    p.decide(decision, now);
    p.advance(now);
    this.emit();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.timer ??= setInterval(() => {
      this.vt += this.tick * this.speed;
      this.players.forEach((p, i) => p.advance(this.vt + (this.scripts[i]?.agoMs ?? 0)));
      this.emit();
    }, this.tick);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  };

  getSnapshot = (): Snapshot => this.snap;

  private emit(): void {
    this.snap = {
      vt: this.vt,
      speed: this.speed,
      runs: this.scripts.map((script, i) => {
        const p = this.players[i];
        const events = p ? [...p.played] : [];
        const pending = p?.pending;
        return { script, events, state: reduce(events), now: this.vt + script.agoMs, ...(pending ? { pending } : {}) };
      }),
    };
    this.listeners.forEach((l) => l());
  }
}

export const useRuns = (store: RunsStore): Snapshot => useSyncExternalStore(store.subscribe, store.getSnapshot);
