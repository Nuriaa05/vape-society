type SaleReference = { id: string; number: string };
export type CollectionReferenceInput = {
  kind: string;
  amountCents: number;
  sale: SaleReference | null;
  allocations: Array<{
    amountCents: number;
    installment: {
      number: number;
      plan: { id: string; title: string; sale: SaleReference | null };
    };
  }>;
};
export type CollectionReference = {
  kind: "Sale" | "Upfront" | "OpeningBalance";
  saleId: string | null;
  saleNumber: string | null;
  planId: string | null;
  title: string;
  amountCents: number;
  installments: Array<{ number: number; amountCents: number }>;
};

export function getCollectionReferences(
  entry: CollectionReferenceInput,
): CollectionReference[] {
  if (entry.allocations.length) {
    const plans = new Map<string, CollectionReference>();
    for (const { installment, amountCents } of entry.allocations) {
      const { plan } = installment;
      let reference = plans.get(plan.id);
      if (!reference) {
        reference = {
          kind: plan.sale ? "Sale" : "OpeningBalance",
          saleId: plan.sale?.id ?? null,
          saleNumber: plan.sale?.number ?? null,
          planId: plan.id,
          title: plan.sale ? `Venta ${plan.sale.number}` : plan.title,
          amountCents: 0,
          installments: [],
        };
        plans.set(plan.id, reference);
      }
      reference.amountCents += amountCents;
      reference.installments.push({ number: installment.number, amountCents });
    }
    return [...plans.values()].map((reference) => ({
      ...reference,
      installments: reference.installments.sort((a, b) => a.number - b.number),
    }));
  }
  if (!entry.sale) return [];
  return [
    {
      kind: entry.kind === "Upfront" ? "Upfront" : "Sale",
      saleId: entry.sale.id,
      saleNumber: entry.sale.number,
      planId: null,
      title: `Venta ${entry.sale.number}`,
      amountCents: entry.amountCents,
      installments: [],
    },
  ];
}
