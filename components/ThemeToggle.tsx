"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "jev-router:theme";
type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Flip the theme with transitions suppressed for one frame so nothing smears. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage blocked; the choice just won't persist
  }
  void root.offsetHeight; // force reflow so the no-transition rule applies
  requestAnimationFrame(() => root.classList.remove("theme-switching"));
  for (const l of listeners) l();
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      onClick={() => applyTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span className="relative block h-4 w-4">
        {/* Both icons stay in the DOM and cross-fade. */}
        <svg
          viewBox="0 0 16 16"
          className="absolute inset-0 h-4 w-4"
          style={{ opacity: theme === "dark" ? 1 : 0, transform: theme === "dark" ? "scale(1)" : "scale(0.25)", filter: theme === "dark" ? "blur(0)" : "blur(4px)", transition: "opacity 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1), filter 200ms cubic-bezier(0.2,0,0,1)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
        </svg>
        <svg
          viewBox="0 0 16 16"
          className="absolute inset-0 h-4 w-4"
          style={{ opacity: theme === "light" ? 1 : 0, transform: theme === "light" ? "scale(1)" : "scale(0.25)", filter: theme === "light" ? "blur(0)" : "blur(4px)", transition: "opacity 200ms cubic-bezier(0.2,0,0,1), transform 200ms cubic-bezier(0.2,0,0,1), filter 200ms cubic-bezier(0.2,0,0,1)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
        </svg>
      </span>
    </button>
  );
}
