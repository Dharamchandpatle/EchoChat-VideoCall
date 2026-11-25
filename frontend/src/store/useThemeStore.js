import { create } from "zustand";

const getSavedTheme = () => {
  if (typeof window === "undefined") return "coffee";
  return (
    localStorage.getItem("echochat-theme") ||
    localStorage.getItem("streamify-theme") ||
    "coffee"
  );
};

const initialTheme = getSavedTheme();

// Immediately apply to documentElement so there is no flash of unstyled theme
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", initialTheme);
}

export const useThemeStore = create((set) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("echochat-theme", theme);
      localStorage.setItem("streamify-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
    set({ theme });
  },
}));
