import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Scenario } from "./mock-data";

interface AppState {
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  uploaded: boolean;
  setUploaded: (v: boolean) => void;
  dark: boolean;
  toggleDark: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>("success");
  const [uploaded, setUploaded] = useState(true);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("shepherd-theme") === "dark") setDark(true);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("shepherd-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Ctx.Provider
      value={{ scenario, setScenario, uploaded, setUploaded, dark, toggleDark: () => setDark((d) => !d) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAppState() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppState must be used within AppStateProvider");
  return c;
}
