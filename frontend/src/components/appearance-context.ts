import { createContext, useContext } from "react";

export type Appearance = "light" | "dark";

export const AppearanceContext = createContext<{
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
} | null>(null);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("Falta el proveedor de apariencia.");
  return context;
}
