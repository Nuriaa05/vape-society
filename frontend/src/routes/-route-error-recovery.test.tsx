import { Children, type ReactElement, type ReactNode } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route } from "./__root";

afterEach(() => vi.unstubAllGlobals());

function clickRetry(error: Error, reset: () => void) {
  const ErrorComponent = Route.options.errorComponent as (
    props: ErrorComponentProps,
  ) => ReactElement<{ children: ReactNode }>;
  const page = ErrorComponent({ error, reset });
  const button = Children.toArray(page.props.children).find(
    (child) =>
      typeof child === "object" && "type" in child && child.type === "button",
  ) as ReactElement<{ onClick: () => void }>;

  button.props.onClick();
}

describe("route error recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: http://127.0.0.1:8081/src/routes/-pages/proveedores.tsx",
    "error loading dynamically imported module: http://127.0.0.1:8081/assets/reportes.js",
    "Importing a module script failed.",
  ])("reloads a failed page module when the user retries: %s", (message) => {
    const reload = vi.fn();
    const reset = vi.fn();
    vi.stubGlobal("window", { location: { reload } });

    clickRetry(new TypeError(message), reset);

    expect(reload).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("resets ordinary page errors without reloading the application", () => {
    const reload = vi.fn();
    const reset = vi.fn();
    vi.stubGlobal("window", { location: { reload } });

    clickRetry(new Error("Failed to fetch"), reset);

    expect(reset).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
});
