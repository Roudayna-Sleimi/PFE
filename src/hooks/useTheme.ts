import { useEffect, useState } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "themeMode";

const getInitialTheme = (): ThemeMode => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem("loginMode");
  if (saved === "light" || saved === "dark") return saved;
  return "dark";
};

export const useTheme = () => {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem("loginMode", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return {
    theme,
    darkMode: theme === "dark",
    toggleTheme,
    setTheme,
  };
};
