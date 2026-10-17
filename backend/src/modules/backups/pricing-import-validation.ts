import { DatabaseSync } from "node:sqlite";
import { BadRequestException } from "@nestjs/common";

const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= 2_147_483_647;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function invalid(): never {
  throw new BadRequestException(
    "El respaldo contiene listas de precios o precios históricos inconsistentes.",
  );
}

export function validatePricingImport(database: DatabaseSync): void {
  const general = database
    .prepare("SELECT id, active FROM PriceList WHERE isGeneral = 1")
    .all();
  if (
    general.length !== 1 ||
    general[0].id !== "general" ||
    general[0].active !== 1
  )
    invalid();
  const checks = [
    "SELECT 1 FROM PriceList WHERE length(trim(name)) = 0 OR length(name) > 100 LIMIT 1",
    `SELECT 1 FROM PriceListTier t LEFT JOIN PriceList l ON l.id=t.priceListId
      WHERE l.id IS NULL OR t.minimumQty < 1 OR t.minimumQty > 2147483647 LIMIT 1`,
    `SELECT 1 FROM PriceListTier GROUP BY priceListId,minimumQty HAVING COUNT(*) > 1 LIMIT 1`,
    `SELECT 1 FROM PriceListPrice p LEFT JOIN PriceListTier t ON t.id=p.tierId
      LEFT JOIN Product product ON product.id=p.productId LEFT JOIN Combo combo ON combo.id=p.comboId
      WHERE t.id IS NULL OR p.priceAmountCents < 0 OR p.priceAmountCents > 2147483647
      OR (p.productId IS NULL) = (p.comboId IS NULL)
      OR (p.productId IS NOT NULL AND product.id IS NULL)
      OR (p.comboId IS NOT NULL AND combo.id IS NULL) LIMIT 1`,
    `SELECT 1 FROM PriceListPrice WHERE productId IS NOT NULL GROUP BY tierId,productId HAVING COUNT(*) > 1 LIMIT 1`,
    `SELECT 1 FROM PriceListPrice WHERE comboId IS NOT NULL GROUP BY tierId,comboId HAVING COUNT(*) > 1 LIMIT 1`,
    `SELECT 1 FROM Customer c LEFT JOIN PriceList l ON l.id=c.priceListId
      WHERE c.priceListId IS NOT NULL AND (l.id IS NULL OR l.active<>1) LIMIT 1`,
  ];
  if (checks.some((sql) => database.prepare(sql).get())) invalid();

  const itemQuery = database.prepare("SELECT * FROM SaleItem WHERE saleId = ?");
  const componentQuery = database.prepare(
    "SELECT * FROM SaleItemComponent WHERE saleItemId = ?",
  );
  for (const sale of database
    .prepare("SELECT * FROM Sale WHERE pricingSnapshot IS NOT NULL")
    .all()) {
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(String(sale.pricingSnapshot));
    } catch {
      invalid();
    }
    if (
      !record(snapshot) ||
      !text(snapshot.listId) ||
      !text(snapshot.listName) ||
      !integer(snapshot.countedUnits, 1) ||
      !Array.isArray(snapshot.lines) ||
      typeof snapshot.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(snapshot.fingerprint) ||
      (snapshot.globalMinimumQty !== null &&
        (!integer(snapshot.globalMinimumQty, 1) ||
          snapshot.globalMinimumQty > snapshot.countedUnits))
    )
      invalid();

    const items = itemQuery.all(sale.id);
    if (items.length !== snapshot.lines.length || !items.length) invalid();
    const byKey = new Map(
      items.map((item) => [
        `${item.itemType}:${item.itemType === "Combo" ? item.comboId : item.productId}`,
        item,
      ]),
    );
    if (byKey.size !== items.length) invalid();
    let units = 0;
    let subtotal = 0;
    for (const line of snapshot.lines) {
      if (
        !record(line) ||
        !["Product", "Combo"].includes(String(line.itemType)) ||
        !text(line.itemId) ||
        !integer(line.qty, 1) ||
        !integer(line.basePriceAmountCents) ||
        !integer(line.appliedPriceAmountCents) ||
        !Array.isArray(line.components)
      )
        invalid();
      if (line.origin === "Catalog") {
        if (
          line.effectiveMinimumQty !== null ||
          line.appliedPriceAmountCents !== line.basePriceAmountCents
        )
          invalid();
      } else if (line.origin === "List") {
        if (
          !integer(line.effectiveMinimumQty, 1) ||
          !integer(snapshot.globalMinimumQty, 1) ||
          line.effectiveMinimumQty > snapshot.globalMinimumQty
        )
          invalid();
      } else invalid();
      const key = `${line.itemType}:${line.itemId}`;
      const item = byKey.get(key);
      if (
        !item ||
        line.qty !== item.qty ||
        line.appliedPriceAmountCents !== item.unitPriceAmountCents ||
        line.qty * line.appliedPriceAmountCents !== item.lineTotalAmountCents
      )
        invalid();
      byKey.delete(key);
      const storedComponents = componentQuery.all(item.id);
      if (line.itemType === "Product") {
        if (line.components.length || storedComponents.length) invalid();
        units += line.qty;
      } else {
        if (
          !storedComponents.length ||
          line.components.length !== storedComponents.length
        )
          invalid();
        const components = new Map(
          storedComponents.map((component) => [
            String(component.productId),
            component,
          ]),
        );
        if (components.size !== storedComponents.length) invalid();
        for (const component of line.components) {
          if (
            !record(component) ||
            !text(component.productId) ||
            !integer(component.qtyPerCombo, 1)
          )
            invalid();
          const stored = components.get(component.productId);
          if (
            !stored ||
            stored.qtyPerCombo !== component.qtyPerCombo ||
            stored.totalQty !== component.qtyPerCombo * line.qty
          )
            invalid();
          units += component.qtyPerCombo * line.qty;
          components.delete(component.productId);
        }
      }
      subtotal += line.qty * line.appliedPriceAmountCents;
    }
    // Historical snapshots are compared with the original sale, never today's list/catalog.
    if (
      !integer(units, 1) ||
      !integer(subtotal) ||
      units !== snapshot.countedUnits ||
      subtotal !== sale.subtotalAmountCents ||
      !integer(sale.discountAmountCents) ||
      sale.discountAmountCents > subtotal ||
      !integer(sale.surchargeAmountCents) ||
      !integer(sale.surchargeBasisPoints) ||
      sale.surchargeBasisPoints > 100_000 ||
      sale.surchargeAmountCents !==
        Math.round(
          ((subtotal - sale.discountAmountCents) * sale.surchargeBasisPoints) /
            10_000,
        ) ||
      sale.totalAmountCents !==
        subtotal - sale.discountAmountCents + sale.surchargeAmountCents
    )
      invalid();
  }
}
