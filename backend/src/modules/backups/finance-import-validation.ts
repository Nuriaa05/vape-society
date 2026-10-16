import { BadRequestException } from "@nestjs/common";
import { DatabaseSync } from "node:sqlite";

// Foreign keys protect entity references, but do not protect monetary totals,
// allocation ownership, business dates, or the snapshot payment-method IDs.
export function validateFinancialImport(database: DatabaseSync): void {
  const inconsistent = (sql: string) => Boolean(database.prepare(sql).get());
  const checks = [
    `SELECT 1 FROM Sale s WHERE
      s.paymentTerms NOT IN ('Immediate', 'DirectInstallments', 'CardInstallments')
      OR (s.paymentTerms = 'CardInstallments' AND s.totalAmountCents <= 0)
      OR (s.paymentTerms = 'DirectInstallments' AND (
        s.customerId IS NULL
        OR 1 <> (SELECT COUNT(*) FROM ReceivablePlan p WHERE p.saleId = s.id)
        OR s.totalAmountCents <> (
          SELECT COALESCE(SUM(p.totalAmountCents), 0) FROM ReceivablePlan p WHERE p.saleId = s.id
        ) + (
          SELECT COALESCE(SUM(c.amountCents), 0) FROM Collection c
          WHERE c.saleId = s.id AND c.kind = 'Upfront'
        )))
      OR (s.paymentTerms = 'CardInstallments' AND s.totalAmountCents <> (
        SELECT COALESCE(SUM(x.grossAmountCents), 0) FROM CardSettlement x WHERE x.saleId = s.id
      ) AND NOT (
        NOT EXISTS (SELECT 1 FROM CardSettlement x WHERE x.saleId = s.id)
        AND NOT EXISTS (SELECT 1 FROM FinancialOperation o WHERE o.kind = 'CardSchedule' AND o.resultId = s.id)
        AND COALESCE(CASE WHEN json_valid(s.financeSnapshot) THEN
          json_type(s.financeSnapshot, '$.cardPlan.deferred') IS 'true'
          AND json_type(s.financeSnapshot, '$.cardPlan.settlements') IS 'array'
          AND json_array_length(s.financeSnapshot, '$.cardPlan.settlements') IS 0
          AND json_type(s.financeSnapshot, '$.cardPlan.processor') IS 'text'
          AND length(trim(json_extract(s.financeSnapshot, '$.cardPlan.processor'))) > 0
          AND json_type(s.financeSnapshot, '$.cardPlan.installmentCount') IS 'integer'
          AND json_extract(s.financeSnapshot, '$.cardPlan.installmentCount') BETWEEN 1 AND 120
          ELSE 0 END, 0)
      ))
      OR (s.paymentTerms = 'Immediate' AND (
        1 <> (SELECT COUNT(*) FROM Collection c WHERE c.saleId = s.id AND c.kind = 'Immediate')
        OR s.totalAmountCents <> (
          SELECT COALESCE(SUM(c.amountCents), 0) FROM Collection c
          WHERE c.saleId = s.id AND c.kind = 'Immediate'
        ))) LIMIT 1`,
    `SELECT 1 FROM ReceivablePlan p JOIN Sale s ON s.id = p.saleId
      WHERE s.paymentTerms IS NOT 'DirectInstallments'
      OR p.customerId IS NOT s.customerId
      OR (p.status = 'Anulado') <> (s.status = 'Anulada') LIMIT 1`,
    `SELECT 1 FROM ReceivablePlan p WHERE p.totalAmountCents <= 0
      OR p.status NOT IN ('Activo', 'Anulado')
      OR p.totalAmountCents <> (SELECT COALESCE(SUM(i.amountCents), 0)
        FROM ReceivableInstallment i WHERE i.planId = p.id) LIMIT 1`,
    `SELECT 1 FROM ReceivableInstallment WHERE amountCents <= 0 OR number < 1 LIMIT 1`,
    `SELECT 1 FROM Collection c LEFT JOIN PaymentMethod m ON m.id = c.paymentMethodId
      WHERE c.amountCents < 0 OR m.id IS NULL
      OR (c.kind = 'Direct' AND c.amountCents <> (SELECT COALESCE(SUM(a.amountCents), 0)
        FROM CollectionAllocation a WHERE a.collectionId = c.id)) LIMIT 1`,
    `SELECT 1 FROM Collection c LEFT JOIN Sale s ON s.id = c.saleId
      WHERE c.kind NOT IN ('Direct', 'Immediate', 'Upfront')
      OR (c.kind = 'Direct' AND c.saleId IS NOT NULL)
      OR (c.kind = 'Immediate' AND (c.saleId IS NULL OR s.paymentTerms IS NOT 'Immediate'))
      OR (c.kind = 'Upfront' AND (c.saleId IS NULL OR s.paymentTerms IS NOT 'DirectInstallments'))
      OR (c.saleId IS NOT NULL AND c.customerId IS NOT s.customerId) LIMIT 1`,
    `SELECT 1 FROM CollectionAllocation a
      JOIN Collection c ON c.id = a.collectionId
      JOIN ReceivableInstallment i ON i.id = a.installmentId
      JOIN ReceivablePlan p ON p.id = i.planId
      WHERE a.amountCents <= 0 OR c.customerId IS NOT p.customerId LIMIT 1`,
    `SELECT 1 FROM ReceivableInstallment i WHERE i.amountCents < (
      SELECT COALESCE(SUM(a.amountCents), 0) FROM CollectionAllocation a
      JOIN Collection c ON c.id = a.collectionId
      WHERE a.installmentId = i.id AND c.reversedAt IS NULL) LIMIT 1`,
    `SELECT 1 FROM CardSettlement WHERE grossAmountCents <= 0
      OR feeAmountCents < 0 OR feeAmountCents > grossAmountCents OR number < 1 LIMIT 1`,
    `SELECT 1 FROM CardSettlement x JOIN Sale s ON s.id = x.saleId
      WHERE s.paymentTerms IS NOT 'CardInstallments' LIMIT 1`,
    `SELECT 1 FROM CardAccreditation WHERE grossAmountCents <= 0
      OR feeAmountCents < 0 OR feeAmountCents > grossAmountCents LIMIT 1`,
    `SELECT 1 FROM CardSettlement s WHERE s.grossAmountCents < (
      SELECT COALESCE(SUM(a.grossAmountCents), 0) FROM CardAccreditation a
      WHERE a.settlementId = s.id AND a.reversedAt IS NULL) + (
      SELECT COALESCE(SUM(c.grossAmountCents), 0) FROM RefundCancellation c
      JOIN Refund r ON r.id = c.refundId
      WHERE c.settlementId = s.id AND r.reversedAt IS NULL) LIMIT 1`,
    `SELECT 1 FROM Refund r LEFT JOIN PaymentMethod m ON m.id = r.paymentMethodId
      LEFT JOIN Customer c ON c.id = r.customerId
      LEFT JOIN Sale s ON s.id = r.saleId
      LEFT JOIN ReceivablePlan p ON p.id = r.planId
      WHERE r.amountCents <= 0 OR r.cashOutAmountCents < 0
      OR (r.saleId IS NULL) = (r.planId IS NULL)
      OR (r.paymentMethodId IS NOT NULL AND m.id IS NULL)
      OR (r.customerId IS NOT NULL AND c.id IS NULL)
      OR r.customerId IS NOT COALESCE(s.customerId, p.customerId)
      OR (r.cashOutAmountCents > 0 AND r.paymentMethodId IS NULL)
      OR r.amountCents <> r.cashOutAmountCents + (
        SELECT COALESCE(SUM(x.grossAmountCents), 0) FROM RefundCancellation x
        WHERE x.refundId = r.id) LIMIT 1`,
    `SELECT 1 FROM RefundCancellation x JOIN Refund r ON r.id = x.refundId
      JOIN CardSettlement s ON s.id = x.settlementId
      JOIN Sale sale ON sale.id = s.saleId
      WHERE x.grossAmountCents <= 0 OR r.saleId IS NOT s.saleId
        OR sale.paymentTerms <> 'CardInstallments' LIMIT 1`,
    `SELECT 1 FROM FinancialOperation o WHERE
      (o.kind = 'OpeningBalance' AND NOT EXISTS (SELECT 1 FROM ReceivablePlan p WHERE p.id = o.resultId))
      OR (o.kind = 'Collection' AND NOT EXISTS (SELECT 1 FROM Collection c WHERE c.id = o.resultId))
      OR (o.kind = 'Accreditation' AND NOT EXISTS (SELECT 1 FROM CardAccreditation a WHERE a.id = o.resultId))
      OR (o.kind = 'Refund' AND NOT EXISTS (SELECT 1 FROM Refund r WHERE r.id = o.resultId))
      OR (o.kind = 'CardSchedule' AND NOT EXISTS (SELECT 1 FROM Sale s WHERE s.id = o.resultId
        AND s.paymentTerms = 'CardInstallments'
        AND EXISTS (SELECT 1 FROM CardSettlement x WHERE x.saleId = s.id)
        AND CASE WHEN json_valid(o.payload) THEN json_extract(o.payload, '$.saleId') = s.id ELSE 0 END))
      OR (o.kind = 'Sale' AND NOT EXISTS (SELECT 1 FROM Sale s
        WHERE s.id = o.resultId AND s.operationId = o.operationId
          AND s.operationPayload = o.payload))
      OR o.kind NOT IN ('OpeningBalance', 'Collection', 'Accreditation', 'Refund', 'Sale', 'CardSchedule',
        'SupplierPurchase', 'SupplierPurchaseDeleted', 'SupplierOpening', 'SupplierPayment', 'SupplierRefund', 'InventoryClassification') LIMIT 1`,
  ];
  for (const [table, column] of [
    ["ReceivableInstallment", "dueDate"],
    ["CardSettlement", "dueDate"],
    ["Collection", "date"],
    ["CardAccreditation", "date"],
    ["Refund", "date"],
  ]) {
    checks.push(`SELECT 1 FROM "${table}" WHERE length("${column}") <> 10
      OR "${column}" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date("${column}", '+0 days') IS NOT "${column}" LIMIT 1`);
  }
  if (checks.some(inconsistent)) {
    throw new BadRequestException(
      "El respaldo contiene cobranzas o saldos inconsistentes.",
    );
  }
  const refundedSources = database
    .prepare(
      `SELECT saleId, planId, SUM(amountCents) AS refunded
    FROM Refund WHERE reversedAt IS NULL GROUP BY saleId, planId`,
    )
    .all();
  for (const source of refundedSources) {
    let maximum: number;
    if (source.saleId !== null) {
      const sale = database
        .prepare(
          "SELECT paymentTerms, totalAmountCents, status FROM Sale WHERE id = ?",
        )
        .get(source.saleId);
      if (!sale || sale.status !== "Anulada")
        throw new BadRequestException(
          "La devolución no corresponde a una venta anulada.",
        );
      maximum =
        sale.paymentTerms === "CardInstallments"
          ? Number(sale.totalAmountCents)
          : Number(
              database
                .prepare(
                  `
        SELECT COALESCE(SUM(amount), 0) AS total FROM (
          SELECT amountCents AS amount FROM Collection WHERE saleId = ? AND reversedAt IS NULL
          UNION ALL SELECT a.amountCents FROM CollectionAllocation a
          JOIN Collection c ON c.id = a.collectionId
          JOIN ReceivableInstallment i ON i.id = a.installmentId
          JOIN ReceivablePlan p ON p.id = i.planId
          WHERE p.saleId = ? AND c.saleId IS NULL AND c.reversedAt IS NULL
        )`,
                )
                .get(source.saleId, source.saleId)!.total,
            );
    } else {
      const plan = database
        .prepare("SELECT status, saleId FROM ReceivablePlan WHERE id = ?")
        .get(source.planId);
      if (!plan || plan.status !== "Anulado" || plan.saleId !== null)
        throw new BadRequestException(
          "La devolución no corresponde a un saldo anterior anulado.",
        );
      maximum = Number(
        database
          .prepare(
            `SELECT COALESCE(SUM(a.amountCents), 0) AS total
        FROM CollectionAllocation a JOIN Collection c ON c.id = a.collectionId
        JOIN ReceivableInstallment i ON i.id = a.installmentId
        WHERE i.planId = ? AND c.reversedAt IS NULL`,
          )
          .get(source.planId)!.total,
      );
    }
    if (Number(source.refunded) > maximum)
      throw new BadRequestException(
        "Las devoluciones del respaldo superan el importe disponible.",
      );
  }
}
