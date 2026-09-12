import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
async function bootstrap() {
  if (import.meta.env.VITE_DESKTOP_TEST === "1")
    await import("@wdio/tauri-plugin");
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void bootstrap();
