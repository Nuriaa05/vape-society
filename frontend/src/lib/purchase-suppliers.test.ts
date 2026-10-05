import { describe, expect, it } from "vitest";

import type { Supplier } from "./contracts";
import { getPurchaseSupplierOptions } from "./purchase-suppliers";

const supplier = (id: string, active: boolean): Supplier => ({
  id,
  name: id,
  phone: "-",
  email: "",
  lastPurchase: "-",
  active,
});

describe("getPurchaseSupplierOptions", () => {
  const suppliers = [supplier("active", true), supplier("inactive", false)];

  it("excludes inactive suppliers from new purchases", () => {
    expect(
      getPurchaseSupplierOptions(suppliers).map((item) => item.id),
    ).toEqual(["active"]);
  });

  it("keeps the current inactive supplier visible when editing an existing draft", () => {
    expect(
      getPurchaseSupplierOptions(suppliers, "inactive").map((item) => item.id),
    ).toEqual(["active", "inactive"]);
  });
});
