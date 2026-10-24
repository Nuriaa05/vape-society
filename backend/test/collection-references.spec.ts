import {
  getCollectionReferences,
  type CollectionReferenceInput,
} from "../src/modules/collections/collection-references";

const sale = { id: "sale-1", number: "000123" };
const base: CollectionReferenceInput = {
  kind: "Direct",
  amountCents: 10001,
  sale: null,
  allocations: [],
};
const allocation = (
  planId: string,
  number: number,
  amountCents: number,
  linkedSale: typeof sale | null = sale,
) => ({
  amountCents,
  installment: {
    number,
    plan: { id: planId, title: "Saldo anterior", sale: linkedSale },
  },
});

describe("collection references", () => {
  it.each(["Immediate", "Upfront"])(
    "identifies a %s payment through its actual sale relation",
    (kind) => {
      expect(getCollectionReferences({ ...base, kind, sale })).toEqual([
        {
          kind: kind === "Upfront" ? "Upfront" : "Sale",
          saleId: sale.id,
          saleNumber: sale.number,
          planId: null,
          title: "Venta 000123",
          amountCents: 10001,
          installments: [],
        },
      ]);
    },
  );

  it("groups installments by their actual plan and sums allocated cents", () => {
    const references = getCollectionReferences({
      ...base,
      allocations: [
        allocation("plan-sale", 3, 1001),
        allocation("opening-1", 1, 2000, null),
        allocation("plan-sale", 1, 3000),
        allocation("opening-2", 1, 4000, null),
      ],
    });
    expect(references).toEqual([
      {
        kind: "Sale",
        saleId: sale.id,
        saleNumber: sale.number,
        planId: "plan-sale",
        title: "Venta 000123",
        amountCents: 4001,
        installments: [
          { number: 1, amountCents: 3000 },
          { number: 3, amountCents: 1001 },
        ],
      },
      {
        kind: "OpeningBalance",
        saleId: null,
        saleNumber: null,
        planId: "opening-1",
        title: "Saldo anterior",
        amountCents: 2000,
        installments: [{ number: 1, amountCents: 2000 }],
      },
      {
        kind: "OpeningBalance",
        saleId: null,
        saleNumber: null,
        planId: "opening-2",
        title: "Saldo anterior",
        amountCents: 4000,
        installments: [{ number: 1, amountCents: 4000 }],
      },
    ]);
    expect(references.reduce((sum, ref) => sum + ref.amountCents, 0)).toBe(
      10001,
    );
  });

  it("uses allocations without counting the direct sale relation again", () => {
    const references = getCollectionReferences({
      ...base,
      sale,
      allocations: [allocation("plan-sale", 1, 10001)],
    });
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      planId: "plan-sale",
      amountCents: 10001,
    });
  });

  it("does not invent a reference when a legacy payment has no relationship", () => {
    expect(getCollectionReferences(base)).toEqual([]);
  });

  it("does not mutate the persisted allocations", () => {
    const entry = {
      ...base,
      allocations: [
        allocation("plan-sale", 3, 1001),
        allocation("plan-sale", 1, 9000),
      ],
    };
    const original = structuredClone(entry);
    getCollectionReferences(entry);
    expect(entry).toEqual(original);
  });
});
