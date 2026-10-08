import { useState, type ReactNode } from "react";
import { createEmptySaleDraft, SaleDraftContext } from "./sale-draft-context";

export function SaleDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(createEmptySaleDraft);

  return (
    <SaleDraftContext.Provider value={{ draft, setDraft }}>
      {children}
    </SaleDraftContext.Provider>
  );
}
