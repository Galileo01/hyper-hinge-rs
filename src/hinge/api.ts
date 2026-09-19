import { useSyncExternalStore } from "react";
import { HingeEngine } from "./engine.mjs";
import { isDesktop, onSensorFrame, setFullscreen } from "./desktop";
export interface SensorFrame {
  available: boolean;
  angle: number | null;
  message: string;
  timestamp: number;
}
export interface HingeState {
  angle: number;
  rawAngle: number;
  velocity: number;
  baseline: number;
  delta: number;
  openness: number;
  closure: number;
  direction: string;
  source: "live" | "simulation";
  available: boolean;
  message: string;
  timestamp: number;
  sensorAgeMs: number;
}
const engine = new HingeEngine();
let hasSavedReference = false;
try {
  const saved = Number(localStorage.getItem("hyperhinge.reference"));
  if (saved > 20 && saved <= 180) {
    engine.baseline = saved;
    hasSavedReference = true;
  }
} catch {
  /* Storage can be disabled in previews. */
}
const listeners = new Set<() => void>();
let simulation = !isDesktop;
let simulatedAngle = 108;
let live: SensorFrame = {
  available: false,
  angle: null,
  message: "Connecting to lid sensor…",
  timestamp: 0,
};
let received = 0;
let first = true;
let state: HingeState = {
  ...engine.snapshot(),
  source: simulation ? "simulation" : "live",
  available: simulation,
  message: simulation ? "Simulated input" : live.message,
  timestamp: performance.now(),
  sensorAgeMs: 0,
};
const receive = (frame: SensorFrame | null) => {
  if (!frame || frame.timestamp < live.timestamp) return;
  live = frame;
  received = performance.now();
  if (first && live.available && live.angle !== null) {
    first = false;
    if (!simulation) {
      engine.reset(live.angle, received);
      if (live.angle > 20 && !hasSavedReference) engine.calibrate();
    }
  }
};
const stopNative = onSensorFrame(receive, () => {
  live = {
    ...live,
    available: false,
    angle: null,
    message: "Sensor bridge unavailable. Try Simulate.",
  };
});
function tick() {
  const now = performance.now();
  const available = simulation || (live.available && now - received < 1500);
  if (available) engine.update(simulation ? simulatedAngle : live.angle!, now);
  else {
    engine.velocity = 0;
    engine.lastTime = null;
  }
  state = {
    ...engine.snapshot(),
    source: simulation ? "simulation" : "live",
    available,
    timestamp: now,
    sensorAgeMs: simulation ? 0 : now - received,
    message: simulation
      ? "Simulated input"
      : available
        ? "Live sensor"
        : live.available
          ? "Sensor data is stale. Try Simulate."
          : live.message,
  };
  listeners.forEach((listener) => listener());
}
const timer = setInterval(tick, 20);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    clearInterval(timer);
    stopNative?.();
    listeners.clear();
  });
export const hinge = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  calibrate() {
    engine.calibrate();
    hasSavedReference = true;
    try {
      localStorage.setItem("hyperhinge.reference", String(engine.baseline));
    } catch {}
    tick();
  },
  simulate(enabled: boolean) {
    simulation = enabled;
    const next = enabled ? state.angle : (live.angle ?? state.angle);
    simulatedAngle = next;
    engine.reset(next, performance.now());
    tick();
  },
  setSimulatedAngle(angle: number) {
    if (Number.isFinite(angle))
      simulatedAngle = Math.max(0, Math.min(140, angle));
  },
  fullscreen: setFullscreen,
};
export function useHinge() {
  return useSyncExternalStore(hinge.subscribe, hinge.getSnapshot);
}
