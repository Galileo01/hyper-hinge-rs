import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { subscribeSnapshot } from "./subscription.mjs";
import type { SensorFrame } from "./api";

export const isDesktop = isTauri();

export function onSensorFrame(
  receive: (frame: SensorFrame | null) => void,
  onError: () => void,
) {
  if (!isDesktop) return () => {};
  return subscribeSnapshot(
    (fn: (frame: SensorFrame) => void) =>
      listen<SensorFrame>("hinge:frame", (event) => fn(event.payload)),
    () => invoke<SensorFrame>("hinge_snapshot"),
    receive,
    onError,
  ).stop;
}
export async function setFullscreen(enabled: boolean) {
  if (isDesktop) await invoke("hinge_fullscreen", { enabled });
  else if (enabled) await document.documentElement.requestFullscreen();
  else if (document.fullscreenElement) await document.exitFullscreen();
}
export function onFullscreenChange(receive: (enabled: boolean) => void) {
  if (!isDesktop) {
    const update = () => receive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }
  return subscribeSnapshot(
    (fn: (enabled: boolean) => void) =>
      listen<boolean>("hinge:fullscreen-changed", (event) => fn(event.payload)),
    () => invoke<boolean>("hinge_fullscreen_state"),
    receive,
    () => {},
  ).stop;
}
