import { Minus, Plus } from "lucide-react";

import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
} from "@/lib/interface-scale";
import { useAppearance } from "./appearance-context";
import { Button } from "./ui/button";

export function InterfaceScaleControl() {
  const { interfaceScale, setInterfaceScale } = useAppearance();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label="Tamaño de la interfaz"
        className="flex items-center gap-2"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Reducir tamaño de la interfaz"
          disabled={interfaceScale <= MIN_INTERFACE_SCALE}
          onClick={() =>
            setInterfaceScale(interfaceScale - INTERFACE_SCALE_STEP)
          }
        >
          <Minus aria-hidden="true" />
        </Button>
        <output
          aria-label="Escala de la interfaz"
          aria-live="polite"
          className="min-w-16 text-center text-sm font-medium tabular-nums"
        >
          {interfaceScale} %
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Aumentar tamaño de la interfaz"
          disabled={interfaceScale >= MAX_INTERFACE_SCALE}
          onClick={() =>
            setInterfaceScale(interfaceScale + INTERFACE_SCALE_STEP)
          }
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={interfaceScale === DEFAULT_INTERFACE_SCALE}
        onClick={() => setInterfaceScale(DEFAULT_INTERFACE_SCALE)}
      >
        Restablecer
      </Button>
    </div>
  );
}
