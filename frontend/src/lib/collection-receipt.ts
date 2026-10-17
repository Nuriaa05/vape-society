import { toast } from "sonner";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import { buildCollectionReceiptHtml } from "./collection-receipt-view";

export async function printReceipt(id: string, refund: boolean) {
  const popup = window.open("", "_blank", "width=900,height=800");
  if (!popup) {
    toast.error("Permití las ventanas emergentes para imprimir.");
    return;
  }
  popup.opener = null;
  popup.document.body.textContent = "Preparando comprobante…";
  try {
    const receipt = await repo.receipt(id, refund);
    const entry = refund ? receipt.refund : receipt.collection;
    const summary = entry?.customerId
      ? await repo.summary({ customerId: entry.customerId }).catch(() => null)
      : null;
    const issuedAt = new Date().toISOString();
    if (popup.closed) return;
    popup.document.open();
    popup.document.write(
      buildCollectionReceiptHtml(receipt, {
        refund,
        issuedAt,
        ...(summary
          ? {
              balance: {
                amountCents: summary.customerDebtAmountCents,
                asOf: issuedAt,
              },
            }
          : {}),
      }),
    );
    popup.document.close();
    const updatePaper = (format: string) => {
      popup.document.body.dataset.paper = format;
      popup.document
        .querySelectorAll<HTMLButtonElement>("[data-format]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.format === format),
          ),
        );
      const sheet = popup.document.querySelector<HTMLElement>(".sheet")!;
      const heightMm = Math.ceil((sheet.scrollHeight * 25.4) / 96) + 2;
      popup.document.getElementById("paper-style")!.textContent =
        format === "ticket"
          ? `@page { size: 58mm ${heightMm}mm; margin: 0; }`
          : "@page { size: A4 portrait; margin: 12mm; }";
    };
    popup.document
      .querySelectorAll<HTMLButtonElement>("[data-format]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          updatePaper(button.dataset.format!),
        ),
      );
    popup.document
      .getElementById("print-receipt")!
      .addEventListener("click", () => {
        updatePaper(popup.document.body.dataset.paper ?? "a4");
        popup.focus();
        popup.print();
      });
    popup.document
      .getElementById("close-receipt")!
      .addEventListener("click", () => popup.close());
    popup.document.body.dataset.receiptReady = "true";
  } catch (error) {
    popup.close();
    toast.error(
      error instanceof Error ? error.message : "No se pudo imprimir.",
    );
  }
}
