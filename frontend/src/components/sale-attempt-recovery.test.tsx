import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuevaVenta } from "@/routes/-pages/nueva-venta";
import { SaleDraftContext, createEmptySaleDraft } from "./sale-draft-context";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaleAttemptRecovery } from "./sale-attempt-recovery";
import { salesRepository } from "@/lib/repositories/sales-repository";
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
const original = {
  operationId: "same-operation",
  expectedPricingFingerprint: "old-quote",
  paymentMethodId: "cash",
  items: [{ itemType: "Product" as const, itemId: "p1", qty: 1 }],
  deliveryStatus: "Entregado" as const,
  cashReceivedAmountCents: 1000,
};
function findAction(
  node: ReactNode,
): ReactElement<{ onClick: () => Promise<unknown> }> | undefined {
  for (const child of Children.toArray(node)) {
    if (
      !isValidElement<{
        children?: ReactNode;
        onClick?: () => Promise<unknown>;
      }>(child)
    )
      continue;
    if (child.props.onClick)
      return child as ReactElement<{ onClick: () => Promise<unknown> }>;
    const found = findAction(child.props.children);
    if (found) return found;
  }
}
describe("uncertain sale recovery UI gate", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders an enabled recovery action instead of edited checkout, with no current pricing dependencies", async () => {
    let stored: unknown;
    let creates = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const request = JSON.parse(String(options?.body));
        if (!stored) {
          creates++;
          stored = request;
          throw new TypeError("response lost after commit");
        }
        expect(request).toEqual(stored);
        return Response.json({
          id: "one-sale",
          number: "1",
          date: "2026-10-16",
          items: [],
          totalAmountCents: 1000,
          payment: "cash",
          deliveryStatus: "Entregado",
          status: "Confirmada",
        });
      }),
    );
    await expect(salesRepository.create(original)).rejects.toThrow(
      "response lost",
    );
    // New prices require 2000 cents; old tender is only 1000. Recovery still has no quote gate.
    const onRecover = vi.fn((payload) => salesRepository.create(payload));
    const view = SaleAttemptRecovery({
      payload: original,
      pending: false,
      error: null,
      onRecover,
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain("Recuperar venta pendiente");
    expect(html).not.toMatch(/<button[^>]* disabled[= >]/);
    const recovered = await findAction(view)?.props.onClick();
    expect(recovered).toMatchObject({ id: "one-sale", total: 10 });
    expect(onRecover).toHaveBeenCalledWith(original);
    expect(creates).toBe(1);
  });
  it("prioritizes persisted recovery after reopening over failed current catalog and invalid cash quote", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["products", "active"], []);
    client
      .getQueryCache()
      .find({ queryKey: ["products", "active"] })!
      .setState({
        status: "error",
        error: new Error("Current catalog unavailable"),
      });
    const draft = {
      ...createEmptySaleDraft(),
      operationId: original.operationId,
      operationFingerprint: JSON.stringify(original),
      cashReceivedInput: "10",
    };
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SaleDraftContext.Provider value={{ draft, setDraft: vi.fn() }}>
          <NuevaVenta />
        </SaleDraftContext.Provider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Recuperar venta pendiente");
    expect(html).not.toContain("No se pudo cargar la venta");
    expect(html).not.toContain("Cliente y forma de pago");
    expect(html).not.toMatch(/<button[^>]* disabled[= >]/);
    client.clear();
  });
});
