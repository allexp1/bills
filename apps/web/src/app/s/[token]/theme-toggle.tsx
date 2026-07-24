"use client";

import { useEffect, useState } from "react";

/** Manual light/dark override on top of the system default. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
      setTheme(stored);
    }
  }, []);

  const toggle = () => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (systemDark ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("theme", next);
    setTheme(next);
  };

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle color scheme">
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
