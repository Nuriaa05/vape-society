import { useLayoutEffect, useState, type ReactNode } from "react";
import { AppearanceContext, type Appearance } from "./appearance-context";

const storageKey = "lozano-core-appearance";

function readAppearance(): Appearance {
  try {
    return localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", appearance === "dark");
    try {
      localStorage.setItem(storageKey, appearance);
    } catch {
      // El tema sigue funcionando si el navegador bloquea el almacenamiento.
    }
  }, [appearance]);

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
