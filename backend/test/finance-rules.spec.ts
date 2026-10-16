import {
  businessToday,
  monthlySchedule,
  validateAllocations,
  validateBusinessDate,
} from "../src/modules/collections/finance-rules";

describe("financial rules", () => {
  it("uses the Argentine business day across UTC month boundaries", () => {
    expect(businessToday(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-31");
  });
  it("anchors month ends to the original day and puts remaining cents last", () => {
    expect(monthlySchedule(10001, 3, "2028-01-31")).toEqual([
      { number: 1, dueDate: "2028-01-31", amountCents: 3333 },
      { number: 2, dueDate: "2028-02-29", amountCents: 3333 },
      { number: 3, dueDate: "2028-03-31", amountCents: 3335 },
    ]);
  });
  it("rejects invalid dates and future actual dates", () => {
    expect(() => validateBusinessDate("2027-02-29")).toThrow();
    expect(() => validateBusinessDate("2999-01-01", true)).toThrow();
  });
  it("requires exact explicit allocations and rejects duplicate installments", () => {
    expect(() =>
      validateAllocations(100, [{ installmentId: "a", amountCents: 99 }]),
    ).toThrow();
    expect(() =>
      validateAllocations(100, [
        { installmentId: "a", amountCents: 50 },
        { installmentId: "a", amountCents: 50 },
      ]),
    ).toThrow();
    expect(() =>
      validateAllocations(100, [{ installmentId: "a", amountCents: 100 }]),
    ).not.toThrow();
  });
});
