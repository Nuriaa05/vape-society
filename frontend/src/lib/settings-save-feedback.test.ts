import { describe, expect, it } from "vitest";

import {
  getSettingsSaveErrorMessage,
  getSettingsSaveSuccessMessage,
} from "./settings-save-feedback";

describe("settings save feedback", () => {
  it("returns clear success and fallback error messages for configuration saves", () => {
    expect(getSettingsSaveSuccessMessage("business")).toBe(
      "Datos del local guardados.",
    );
    expect(getSettingsSaveSuccessMessage("receipt")).toBe(
      "Comprobante interno guardado.",
    );
    expect(getSettingsSaveSuccessMessage("defaultMargin")).toBe(
      "Margen de ganancia guardado.",
    );
    expect(getSettingsSaveErrorMessage("business")).toBe(
      "No se pudieron guardar los datos del local.",
    );
  });
});
