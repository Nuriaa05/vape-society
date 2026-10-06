import { ApiError } from "@/lib/api-client";
import type { SaleCatalogItem } from "@/lib/contracts";

export type Line = { product: SaleCatalogItem; qty: number };

const STOCK_CONFLICT_FALLBACK =
  "No hay stock disponible suficiente para completar esta venta.";

export type QuotedSaleConfirmationState = {
  hasLines: boolean;
  hasPaymentMethod: boolean;
  quotePending: boolean;
  quoteError: boolean;
  quoteAvailable: boolean;
  cashShortfall: number;
};

export function applyCouponCode(input: string): string {
  return input.trim().toUpperCase();
}

export function clearAppliedCoupon(): string {
  return "";
}

export function filterSaleCatalogItems(
  items: SaleCatalogItem[],
  query: string,
): SaleCatalogItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("es-AR");
  if (!normalizedQuery) return [];

  return items.filter(
    (item) =>
      item.name.toLocaleLowerCase("es-AR").includes(normalizedQuery) ||
      item.barcode.toLocaleLowerCase("es-AR").includes(normalizedQuery),
  );
}

export function canConfirmQuotedSale(
  state: QuotedSaleConfirmationState,
): boolean {
  return (
    state.hasLines &&
    state.hasPaymentMethod &&
    !state.quotePending &&
    !state.quoteError &&
    state.quoteAvailable &&
    state.cashShortfall === 0
  );
}

export function normalizeCartQty(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

function getItemType(item: SaleCatalogItem): "Product" | "Combo" {
  return item.itemType === "Combo" ? "Combo" : "Product";
}

export function getCartItemKey(item: SaleCatalogItem): string {
  return `${getItemType(item)}:${item.id}`;
}

function isSameCartProduct(
  first: SaleCatalogItem,
  second: SaleCatalogItem,
): boolean {
  const sameType = getItemType(first) === getItemType(second);

  return (
    (sameType && first.id === second.id) ||
    (!!first.barcode && first.barcode === second.barcode)
  );
}

function isSameCartKey(line: Line, itemKeyOrProductId: string): boolean {
  return (
    getCartItemKey(line.product) === itemKeyOrProductId ||
    (getItemType(line.product) === "Product" &&
      line.product.id === itemKeyOrProductId)
  );
}

export type NegativeStockWarning = {
  productId: string;
  productName: string;
  requestedQty: number;
  availableStock: number;
  resultingStock: number;
};

export function getNegativeStockWarnings(
  lines: Line[],
): NegativeStockWarning[] {
  return lines.flatMap((line) => {
    if (line.product.itemType === "Combo") {
      return line.product.items.flatMap((component) => {
        const requestedQty = component.qty * line.qty;
        const availableStock = component.availableStock ?? component.stock ?? 0;
        const resultingStock = availableStock - requestedQty;

        if (resultingStock >= 0) {
          return [];
        }

        return [
          {
            productId: component.productId,
            productName: component.productName,
            requestedQty,
            availableStock,
            resultingStock,
          },
        ];
      });
    }

    const availableStock = line.product.availableStock ?? line.product.stock;
    const resultingStock = availableStock - line.qty;

    if (resultingStock >= 0) {
      return [];
    }

    return [
      {
        productId: line.product.id,
        productName: line.product.name,
        requestedQty: line.qty,
        availableStock,
        resultingStock,
      },
    ];
  });
}

export function addOrIncrementLine(
  lines: Line[],
  product: SaleCatalogItem,
): Line[] {
  const matchingQty = lines
    .filter((line) => isSameCartProduct(line.product, product))
    .reduce((total, line) => total + line.qty, 0);

  if (matchingQty === 0) {
    return [...lines, { product, qty: 1 }];
  }

  let merged = false;

  return lines.reduce<Line[]>((nextLines, line) => {
    if (!isSameCartProduct(line.product, product)) {
      return [...nextLines, line];
    }

    if (merged) {
      return nextLines;
    }

    merged = true;
    return [...nextLines, { product: line.product, qty: matchingQty + 1 }];
  }, []);
}

export function setLineQuantity(
  lines: Line[],
  itemKeyOrProductId: string,
  value: string | number,
): Line[] {
  const qty = normalizeCartQty(value);
  return lines.map((line) =>
    isSameCartKey(line, itemKeyOrProductId) ? { ...line, qty } : line,
  );
}

export function adjustLineQuantity(
  lines: Line[],
  itemKeyOrProductId: string,
  delta: number,
): Line[] {
  return lines.map((line) =>
    isSameCartKey(line, itemKeyOrProductId)
      ? { ...line, qty: normalizeCartQty(line.qty + delta) }
      : line,
  );
}

export function getSaleCreationErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    const message = error.message.trim();
    if (message.toLowerCase().includes("stock")) {
      return message;
    }

    return STOCK_CONFLICT_FALLBACK;
  }

  return error instanceof Error
    ? error.message
    : "No se pudo confirmar la venta.";
}
