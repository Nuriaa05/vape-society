-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountBasisPoints" INTEGER,
    "discountAmountCents" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PaymentMethod" ("createdAt", "enabled", "id", "name", "updatedAt") SELECT "createdAt", "enabled", "id", "name", "updatedAt" FROM "PaymentMethod";
DROP TABLE "PaymentMethod";
ALTER TABLE "new_PaymentMethod" RENAME TO "PaymentMethod";
CREATE UNIQUE INDEX "PaymentMethod_name_key" ON "PaymentMethod"("name");
UPDATE "PaymentMethod"
SET "cashHandling" = true
WHERE LOWER(TRIM("name")) = 'efectivo';
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
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
    CONSTRAINT "Sale_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("cancelReason", "cancelledAt", "createdAt", "date", "deliveryStatus", "id", "number", "paymentMethodId", "paymentMethodName", "status", "subtotalAmountCents", "totalAmountCents", "updatedAt") SELECT "cancelReason", "cancelledAt", "createdAt", "date", "deliveryStatus", "id", "number", "paymentMethodId", "paymentMethodName", "status", "subtotalAmountCents", "totalAmountCents", "updatedAt" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");
CREATE INDEX "Sale_date_idx" ON "Sale"("date");
CREATE INDEX "Sale_deliveryStatus_idx" ON "Sale"("deliveryStatus");
CREATE INDEX "Sale_status_idx" ON "Sale"("status");
CREATE INDEX "Sale_paymentMethodId_idx" ON "Sale"("paymentMethodId");
CREATE INDEX "Sale_couponId_idx" ON "Sale"("couponId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_enabled_idx" ON "Coupon"("enabled");
