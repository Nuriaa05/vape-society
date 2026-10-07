import { useLayoutEffect, useState, type ReactNode } from "react";
import { AppearanceContext, type Appearance } from "./appearance-context";
import {
  DEFAULT_INTERFACE_SCALE,
  normalizeInterfaceScale,
  parseStoredInterfaceScale,
} from "@/lib/interface-scale";

const storageKey = "lozano-core-appearance";
const scaleStorageKey = "vape-society-interface-scale";

function readAppearance(): Appearance {
  try {
    return localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readInterfaceScale(): number {
  try {
    return parseStoredInterfaceScale(localStorage.getItem(scaleStorageKey));
  } catch {
    return DEFAULT_INTERFACE_SCALE;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [interfaceScale, setScale] = useState(readInterfaceScale);

  function setInterfaceScale(scale: number) {
    setScale(normalizeInterfaceScale(scale));
  }

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", appearance === "dark");
    try {
      localStorage.setItem(storageKey, appearance);
    } catch {
      // El tema sigue funcionando si el navegador bloquea el almacenamiento.
    }
  }, [appearance]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--interface-scale",
      String(interfaceScale / 100),
    );
    try {
      localStorage.setItem(scaleStorageKey, String(interfaceScale));
    } catch {
      // La escala sigue funcionando si el navegador bloquea el almacenamiento.
    }
  }, [interfaceScale]);

  return (
    <AppearanceContext.Provider
      value={{ appearance, setAppearance, interfaceScale, setInterfaceScale }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}
