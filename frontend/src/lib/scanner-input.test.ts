import { describe, expect, it } from "vitest";

import { isScannerSubmitKey } from "./scanner-input";

describe("scanner input", () => {
  it("treats enter keys as scanner submission keys", () => {
    expect(isScannerSubmitKey("Enter")).toBe(true);
    expect(isScannerSubmitKey("NumpadEnter")).toBe(true);
    expect(isScannerSubmitKey("Tab")).toBe(false);
  });
});
