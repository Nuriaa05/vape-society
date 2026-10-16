ALTER TABLE "StockMovement" ADD COLUMN "unallocatedQty" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SupplierPayable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Activa',
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierPayable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payableId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierRefund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payableId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierRefund_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "payableId" TEXT,
    "originMovementId" TEXT,
    "classification" TEXT NOT NULL,
    "unitCostAmountCents" INTEGER NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "initialQty" INTEGER NOT NULL,
    "remainingQty" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryLot_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryLot_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryLot_originMovementId_fkey" FOREIGN KEY ("originMovementId") REFERENCES "StockMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lotId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    CONSTRAINT "InventoryAllocation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryAllocation_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "paymentCondition" TEXT NOT NULL DEFAULT 'SinSeguimiento',
    "dueDate" TEXT,
    "paymentDate" TEXT,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("cancelReason", "cancelledAt", "createdAt", "date", "id", "status", "supplierId", "totalAmountCents", "updatedAt") SELECT "cancelReason", "cancelledAt", "createdAt", "date", "id", "status", "supplierId", "totalAmountCents", "updatedAt" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");
CREATE INDEX "Purchase_date_idx" ON "Purchase"("date");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayable_purchaseId_key" ON "SupplierPayable"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierPayable_supplierId_idx" ON "SupplierPayable"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayable_dueDate_idx" ON "SupplierPayable"("dueDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_payableId_idx" ON "SupplierPayment"("payableId");

-- CreateIndex
CREATE INDEX "SupplierPayment_date_idx" ON "SupplierPayment"("date");

-- CreateIndex
CREATE INDEX "SupplierRefund_payableId_idx" ON "SupplierRefund"("payableId");

-- CreateIndex
CREATE INDEX "SupplierRefund_date_idx" ON "SupplierRefund"("date");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_purchaseItemId_key" ON "InventoryLot"("purchaseItemId");

-- CreateIndex
CREATE INDEX "InventoryLot_originMovementId_idx" ON "InventoryLot"("originMovementId");

-- CreateIndex
CREATE INDEX "InventoryLot_productId_receivedAt_idx" ON "InventoryLot"("productId", "receivedAt");

-- CreateIndex
CREATE INDEX "InventoryLot_payableId_idx" ON "InventoryLot"("payableId");

-- CreateIndex
CREATE INDEX "InventoryAllocation_stockMovementId_idx" ON "InventoryAllocation"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAllocation_lotId_stockMovementId_key" ON "InventoryAllocation"("lotId", "stockMovementId");

-- Existing stock has no reliable payment origin. Preserve its current cost without fabricating debt.
INSERT INTO "InventoryLot" ("id", "productId", "classification", "unitCostAmountCents", "receivedAt", "initialQty", "remainingQty", "createdAt")
SELECT 'legacy-stock-' || "id", "id", 'SinClasificar', "costAmountCents", CURRENT_TIMESTAMP, "physicalStock", "physicalStock", CURRENT_TIMESTAMP
FROM "Product" WHERE "physicalStock" > 0;
