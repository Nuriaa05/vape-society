-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReceivablePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "title" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activo',
    "cancelReason" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceivablePlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReceivablePlan_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceivableInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "ReceivableInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ReceivablePlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "customerName" TEXT,
    "saleId" TEXT,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Direct',
    "paymentMethodId" TEXT NOT NULL,
    "paymentMethodName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cashReceivedAmountCents" INTEGER,
    "changeAmountCents" INTEGER,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Collection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Collection_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollectionAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collectionId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "CollectionAllocation_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CollectionAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "ReceivableInstallment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardSettlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "reference" TEXT,
    "number" INTEGER NOT NULL,
    "dueDate" TEXT NOT NULL,
    "grossAmountCents" INTEGER NOT NULL,
    "feeAmountCents" INTEGER NOT NULL,
    CONSTRAINT "CardSettlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardAccreditation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "settlementId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "grossAmountCents" INTEGER NOT NULL,
    "feeAmountCents" INTEGER NOT NULL,
    "reference" TEXT,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardAccreditation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CardSettlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT,
    "planId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cashOutAmountCents" INTEGER NOT NULL,
    "paymentMethodId" TEXT,
    "paymentMethodName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ReceivablePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundCancellation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "grossAmountCents" INTEGER NOT NULL,
    CONSTRAINT "RefundCancellation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefundCancellation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CardSettlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialOperation" (
    "operationId" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentMethod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "surchargeBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "cashHandling" BOOLEAN NOT NULL DEFAULT false,
    "collectionEligible" BOOLEAN NOT NULL DEFAULT false,
    "supportsInstallments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PaymentMethod" ("cashHandling", "createdAt", "enabled", "id", "name", "surchargeBasisPoints", "updatedAt") SELECT "cashHandling", "createdAt", "enabled", "id", "name", "surchargeBasisPoints", "updatedAt" FROM "PaymentMethod";
DROP TABLE "PaymentMethod";
ALTER TABLE "new_PaymentMethod" RENAME TO "PaymentMethod";
-- Initialize capabilities once, keeping subsequent user edits untouched.
UPDATE "PaymentMethod" SET "collectionEligible" = true WHERE "id" IN ('pm1', 'pm2', 'pm4');
UPDATE "PaymentMethod" SET "supportsInstallments" = true WHERE "id" = 'pm7';
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deliveryStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "customerId" TEXT,
    "paymentTerms" TEXT,
    "financeSnapshot" TEXT,
    "operationId" TEXT,
    "operationPayload" TEXT,
    "couponId" TEXT,
    "couponCode" TEXT,
    "couponType" TEXT,
    "couponBasisPoints" INTEGER,
    "couponValueAmountCents" INTEGER,
    "discountAmountCents" INTEGER NOT NULL DEFAULT 0,
    "paymentMethodName" TEXT NOT NULL DEFAULT '',
    "surchargeBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "surchargeAmountCents" INTEGER NOT NULL DEFAULT 0,
    "cashReceivedAmountCents" INTEGER,
    "changeAmountCents" INTEGER,
    "subtotalAmountCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "cancelReason" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("cancelReason", "cancelledAt", "cashReceivedAmountCents", "changeAmountCents", "couponBasisPoints", "couponCode", "couponId", "couponType", "couponValueAmountCents", "createdAt", "customerName", "customerPhone", "date", "deliveryStatus", "discountAmountCents", "id", "number", "paymentMethodId", "paymentMethodName", "status", "subtotalAmountCents", "surchargeAmountCents", "surchargeBasisPoints", "totalAmountCents", "updatedAt") SELECT "cancelReason", "cancelledAt", "cashReceivedAmountCents", "changeAmountCents", "couponBasisPoints", "couponCode", "couponId", "couponType", "couponValueAmountCents", "createdAt", "customerName", "customerPhone", "date", "deliveryStatus", "discountAmountCents", "id", "number", "paymentMethodId", "paymentMethodName", "status", "subtotalAmountCents", "surchargeAmountCents", "surchargeBasisPoints", "totalAmountCents", "updatedAt" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");
CREATE UNIQUE INDEX "Sale_operationId_key" ON "Sale"("operationId");
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
CREATE INDEX "Sale_deliveryStatus_idx" ON "Sale"("deliveryStatus");
CREATE INDEX "Sale_status_idx" ON "Sale"("status");
CREATE INDEX "Sale_paymentMethodId_idx" ON "Sale"("paymentMethodId");
CREATE INDEX "Sale_couponId_idx" ON "Sale"("couponId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivablePlan_saleId_key" ON "ReceivablePlan"("saleId");

-- CreateIndex
CREATE INDEX "ReceivablePlan_customerId_idx" ON "ReceivablePlan"("customerId");

-- CreateIndex
CREATE INDEX "ReceivableInstallment_dueDate_idx" ON "ReceivableInstallment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableInstallment_planId_number_key" ON "ReceivableInstallment"("planId", "number");

-- CreateIndex
CREATE INDEX "Collection_date_idx" ON "Collection"("date");

-- CreateIndex
CREATE INDEX "Collection_customerId_idx" ON "Collection"("customerId");

-- CreateIndex
CREATE INDEX "Collection_saleId_idx" ON "Collection"("saleId");

-- CreateIndex
CREATE INDEX "CollectionAllocation_installmentId_idx" ON "CollectionAllocation"("installmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAllocation_collectionId_installmentId_key" ON "CollectionAllocation"("collectionId", "installmentId");

-- CreateIndex
CREATE INDEX "CardSettlement_dueDate_idx" ON "CardSettlement"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardSettlement_saleId_number_key" ON "CardSettlement"("saleId", "number");

-- CreateIndex
CREATE INDEX "CardAccreditation_date_idx" ON "CardAccreditation"("date");

-- CreateIndex
CREATE INDEX "Refund_date_idx" ON "Refund"("date");

-- CreateIndex
CREATE INDEX "Refund_customerId_idx" ON "Refund"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundCancellation_refundId_settlementId_key" ON "RefundCancellation"("refundId", "settlementId");

