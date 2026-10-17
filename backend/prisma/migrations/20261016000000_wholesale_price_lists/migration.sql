CREATE TABLE "PriceList" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL CHECK(length(trim("name")) > 0),
  "isGeneral" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CHECK("isGeneral" = 0 OR "active" = 1)
);
CREATE UNIQUE INDEX "PriceList_general_unique" ON "PriceList"("isGeneral") WHERE "isGeneral" = 1;
CREATE TABLE "PriceListTier" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "priceListId" TEXT NOT NULL,
  "minimumQty" INTEGER NOT NULL CHECK(typeof("minimumQty") = 'integer' AND "minimumQty" >= 1),
  FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PriceListTier_priceListId_minimumQty_key" ON "PriceListTier"("priceListId", "minimumQty");
CREATE TABLE "PriceListPrice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tierId" TEXT NOT NULL,
  "productId" TEXT,
  "comboId" TEXT,
  "priceAmountCents" INTEGER NOT NULL CHECK(typeof("priceAmountCents") = 'integer' AND "priceAmountCents" BETWEEN 0 AND 2147483647),
  CHECK(("productId" IS NOT NULL AND "comboId" IS NULL) OR ("productId" IS NULL AND "comboId" IS NOT NULL)),
  FOREIGN KEY ("tierId") REFERENCES "PriceListTier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PriceListPrice_tierId_productId_key" ON "PriceListPrice"("tierId", "productId");
CREATE UNIQUE INDEX "PriceListPrice_tierId_comboId_key" ON "PriceListPrice"("tierId", "comboId");
ALTER TABLE "Customer" ADD COLUMN "priceListId" TEXT REFERENCES "PriceList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD COLUMN "pricingSnapshot" TEXT;
INSERT INTO "PriceList" ("id", "name", "isGeneral", "active", "updatedAt") VALUES ('general', 'General', 1, 1, CURRENT_TIMESTAMP);
