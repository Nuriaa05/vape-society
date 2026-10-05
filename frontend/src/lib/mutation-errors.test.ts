import { describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { getMutationErrorMessage } from "./mutation-errors";

describe("mutation error messages", () => {
  it("uses API errors when the backend returns a clear message", () => {
    expect(
      getMutationErrorMessage(
        new ApiError("No se puede eliminar porque tiene historial.", 409),
        "No se pudo completar la accion.",
      ),
    ).toBe("No se puede eliminar porque tiene historial.");
  });

  it("falls back for unknown errors", () => {
    expect(getMutationErrorMessage("fallo", "No se pudo completar.")).toBe(
      "No se pudo completar.",
    );
  });
});
