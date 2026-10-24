import { DatabaseSync } from "node:sqlite";
import { BadRequestException } from "@nestjs/common";

export function validateSupplierInventoryImport(database: DatabaseSync): void {
  const checks = [
    `SELECT 1 FROM StockMovement m WHERE m.unallocatedQty<0 OR (m.unallocatedQty>0 AND
      (m.sourceType<>'Sale' OR m.type<>'Venta' OR m.unallocatedQty>-m.physicalDelta
      OR -m.physicalDelta<>m.unallocatedQty-(SELECT COALESCE(SUM(a.qty),0) FROM InventoryAllocation a WHERE a.stockMovementId=m.id))) LIMIT 1`,
    `SELECT 1 FROM StockMovement m WHERE m.sourceType='Sale' AND m.type='Venta'
      AND EXISTS(SELECT 1 FROM InventoryAllocation a WHERE a.stockMovementId=m.id)
      AND m.physicalDelta<>(SELECT COALESCE(SUM(a.qty),0) FROM InventoryAllocation a WHERE a.stockMovementId=m.id)-m.unallocatedQty LIMIT 1`,
    `SELECT 1 FROM Product p WHERE MAX(p.physicalStock, 0) <> (
      SELECT COALESCE(SUM(l.remainingQty), 0) FROM InventoryLot l WHERE l.productId=p.id) LIMIT 1`,
    `SELECT 1 FROM InventoryLot l WHERE l.initialQty <= 0 OR l.remainingQty < 0
      OR l.remainingQty > l.initialQty OR l.unitCostAmountCents < 0
      OR l.classification NOT IN ('Pagada','Credito','SinClasificar')
      OR l.remainingQty <> l.initialQty + (SELECT COALESCE(SUM(a.qty),0) FROM InventoryAllocation a WHERE a.lotId=l.id)
      OR (l.classification='Credito' AND l.payableId IS NULL)
      OR (l.classification='SinClasificar' AND l.payableId IS NOT NULL) LIMIT 1`,
    `SELECT 1 FROM InventoryLot l JOIN SupplierPayable p ON p.id=l.payableId
      WHERE (l.classification='Pagada') <> EXISTS(SELECT 1 FROM SupplierPayment x WHERE x.payableId=p.id AND x.reversedAt IS NULL)
      OR (p.status='Anulada' AND l.remainingQty <> 0) LIMIT 1`,
    `SELECT 1 FROM InventoryLot l JOIN PurchaseItem i ON i.id=l.purchaseItemId
      LEFT JOIN SupplierPayable p ON p.id=l.payableId
      WHERE l.productId<>i.productId OR l.initialQty<>i.qty OR l.unitCostAmountCents<>i.unitCostAmountCents
      OR (p.id IS NOT NULL AND p.purchaseId IS NOT i.purchaseId) LIMIT 1`,
    `SELECT 1 FROM InventoryLot l JOIN StockMovement m ON m.id=l.originMovementId
      WHERE l.productId<>m.productId LIMIT 1`,
    `SELECT 1 FROM InventoryAllocation a JOIN InventoryLot l ON l.id=a.lotId
      JOIN StockMovement m ON m.id=a.stockMovementId WHERE a.qty=0 OR l.productId<>m.productId LIMIT 1`,
    `SELECT 1 FROM SupplierPayable p WHERE p.amountCents<=0 OR p.status NOT IN ('Activa','Anulada')
      OR (p.status='Anulada' AND (p.cancelledAt IS NULL OR length(trim(COALESCE(p.cancelReason,'')))=0))
      OR 1 < (SELECT COUNT(*) FROM SupplierPayment x WHERE x.payableId=p.id AND x.reversedAt IS NULL)
      OR (p.status='Activa' AND EXISTS(SELECT 1 FROM SupplierRefund r WHERE r.payableId=p.id))
      OR (SELECT COALESCE(SUM(r.amountCents),0) FROM SupplierRefund r WHERE r.payableId=p.id AND r.reversedAt IS NULL)
        > (SELECT COALESCE(SUM(x.amountCents),0) FROM SupplierPayment x WHERE x.payableId=p.id AND x.reversedAt IS NULL) LIMIT 1`,
    `SELECT 1 FROM SupplierPayable p JOIN Purchase c ON c.id=p.purchaseId
      WHERE c.supplierId<>p.supplierId OR c.totalAmountCents<>p.amountCents
      OR c.paymentCondition='SinSeguimiento' OR c.status='Pendiente'
      OR (p.status='Anulada')<>(c.status='Anulada') LIMIT 1`,
    `SELECT 1 FROM Purchase c WHERE c.paymentCondition NOT IN ('SinSeguimiento','Pagada','Credito')
      OR (c.paymentCondition<>'SinSeguimiento' AND (c.status='Registrada' OR EXISTS(
        SELECT 1 FROM StockMovement m WHERE m.sourceType='Purchase' AND m.sourceId=c.id AND m.type='Compra')) AND NOT EXISTS(
        SELECT 1 FROM SupplierPayable p WHERE p.purchaseId=c.id)) LIMIT 1`,
    `SELECT 1 FROM PurchaseItem i JOIN Purchase c ON c.id=i.purchaseId
      LEFT JOIN InventoryLot l ON l.purchaseItemId=i.id
      LEFT JOIN SupplierPayable p ON p.id=l.payableId
      WHERE c.paymentCondition<>'SinSeguimiento' AND (c.status='Registrada' OR EXISTS(
        SELECT 1 FROM SupplierPayable tracked WHERE tracked.purchaseId=c.id))
      AND (l.id IS NULL OR p.purchaseId IS NOT c.id) LIMIT 1`,
    `SELECT 1 FROM StockMovement m WHERE m.sourceType='StockClassification' AND m.type='Clasificacion'
      AND (m.physicalDelta<>0 OR NOT EXISTS(SELECT 1 FROM InventoryLot l WHERE l.originMovementId=m.id)
      OR (SELECT COALESCE(SUM(l.initialQty),0) FROM InventoryLot l WHERE l.originMovementId=m.id)
         <> -(SELECT COALESCE(SUM(a.qty),0) FROM InventoryAllocation a WHERE a.stockMovementId=m.id)) LIMIT 1`,
    `SELECT 1 FROM SupplierPayment x JOIN SupplierPayable p ON p.id=x.payableId WHERE x.amountCents<>p.amountCents LIMIT 1`,
    `SELECT 1 FROM SupplierPayment x WHERE x.method='Sin especificar' AND NOT EXISTS(
      SELECT 1 FROM SupplierPayable p JOIN Purchase c ON c.id=p.purchaseId
      WHERE p.id=x.payableId AND c.paymentCondition='Pagada') LIMIT 1`,
    `SELECT 1 FROM SupplierRefund x JOIN SupplierPayable p ON p.id=x.payableId WHERE x.amountCents<>p.amountCents LIMIT 1`,
    `SELECT 1 FROM FinancialOperation o WHERE o.kind='SupplierPurchaseDeleted' AND
      (NOT json_valid(o.payload) OR EXISTS(SELECT 1 FROM Purchase p WHERE p.id=o.resultId)) LIMIT 1`,
  ];
  for (const table of ["SupplierPayment", "SupplierRefund"]) {
    checks.push(`SELECT 1 FROM ${table} WHERE amountCents<=0
      OR method NOT IN ('Efectivo','Transferencia','QR'${table === "SupplierPayment" ? ",'Sin especificar'" : ""})
      OR (reversedAt IS NOT NULL AND length(trim(COALESCE(reversalReason,'')))=0) LIMIT 1`);
  }
  for (const [table, column] of [
    ["SupplierPayable", "dueDate"],
    ["SupplierPayment", "date"],
    ["SupplierRefund", "date"],
    ["Purchase", "dueDate"],
    ["Purchase", "paymentDate"],
  ]) {
    checks.push(`SELECT 1 FROM ${table} WHERE ${column} IS NOT NULL AND
      (length(${column})<>10 OR ${column} NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date(${column}, '+0 days') IS NOT ${column}) LIMIT 1`);
  }
  for (const [kind, table] of [
    ["SupplierPurchase", "Purchase"],
    ["SupplierOpening", "SupplierPayable"],
    ["SupplierPayment", "SupplierPayment"],
    ["SupplierRefund", "SupplierRefund"],
    ["InventoryClassification", "StockMovement"],
  ]) {
    checks.push(`SELECT 1 FROM FinancialOperation o WHERE o.kind='${kind}' AND
      (NOT json_valid(o.payload) OR NOT EXISTS(SELECT 1 FROM ${table} r WHERE r.id=o.resultId)) LIMIT 1`);
  }
  if (checks.some((sql) => database.prepare(sql).get())) {
    throw new BadRequestException(
      "El respaldo contiene stock, deudas o pagos a proveedores inconsistentes.",
    );
  }
}
