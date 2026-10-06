import type { LocalSettings } from "@/lib/contracts";
import { formatAmountCentsAsARS } from "@/lib/money";
import { buildReceiptHeaderLines, getReceiptFooter } from "@/lib/receipt-view";

export function SettingsReceiptPreview({
  business,
  receipt,
  comboTicketMode,
}: Pick<LocalSettings, "business" | "receipt" | "comboTicketMode">) {
  const headerLines = buildReceiptHeaderLines({ business, receipt });

  return (
    <figure className="mx-auto w-full max-w-xs xl:sticky xl:top-24">
      <figcaption className="mb-3 text-center text-xs text-muted-foreground">
        Vista previa · ejemplo
      </figcaption>
      <div className="rounded-sm bg-white p-5 font-mono text-xs leading-relaxed text-zinc-950 shadow-lg">
        <div className="space-y-1 text-center">
          {headerLines.map((line, index) => (
            <p
              key={index}
              className={`whitespace-pre-wrap break-words ${index === 0 ? "font-semibold" : ""}`}
            >
              {line}
            </p>
          ))}
        </div>
        <div className="my-3 border-y border-dashed border-zinc-300 py-2">
          <p>Comprobante de ejemplo</p>
          <p>Entrega: Entregado</p>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between gap-3">
            <span>1x Producto</span>
            <span className="shrink-0">{formatAmountCentsAsARS(1000000)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>1x Combo</span>
            <span className="shrink-0">{formatAmountCentsAsARS(2000000)}</span>
          </div>
          {comboTicketMode === "ComboWithComponents" && (
            <div className="space-y-1 pl-3 text-zinc-600">
              <p>1x Componente 1</p>
              <p>1x Componente 2</p>
            </div>
          )}
        </div>
        <div className="mt-3 space-y-2 border-t border-dashed border-zinc-300 pt-2">
          <div className="flex justify-between gap-3 font-semibold">
            <span>TOTAL</span>
            <span className="shrink-0">{formatAmountCentsAsARS(3000000)}</span>
          </div>
          <p>Pago: Método de pago</p>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words border-t border-dashed border-zinc-300 pt-3 text-center">
          {getReceiptFooter(receipt)}
        </p>
      </div>
    </figure>
  );
}
