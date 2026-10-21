const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { test } = require("node:test");

test("rejects production ports and arguments that could target an existing database", () => {
  const { parseOptions } = require("./create-stock-demo.cjs");
  assert.deepEqual(parseOptions([]), { serve: false, port: 0 });
  assert.deepEqual(parseOptions(["--serve", "--port", "3003"]), {
    serve: true,
    port: 3003,
  });
  for (const args of [
    ["--port", "3002"],
    ["--port", "43120"],
    ["--port", "-1"],
    ["--port", "65536"],
    ["--port", "3.5"],
    ["--port"],
    ["--database", "backend/prisma/core.db"],
    ["--origin", "http://127.0.0.1:3002"],
  ]) {
    assert.throws(() => parseOptions(args));
  }
});

test(
  "creates an isolated classified catalog, real supplier debts and General wholesale tiers",
  { timeout: 180000 },
  async () => {
    const { createStockDemo } = require("./create-stock-demo.cjs");
    const sentinelDir = mkdtempSync(join(tmpdir(), "vape-demo-sentinel-test-"));
    const sentinelPath = join(sentinelDir, "existing.db");
    const sentinelContent =
      "Esta base existente no debe abrirse ni modificarse.";
    writeFileSync(sentinelPath, sentinelContent, "utf8");
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${sentinelPath.replaceAll("\\", "/")}`;
    let demo;
    try {
      demo = await createStockDemo();
      assert.notEqual(demo.databasePath, sentinelPath);
      assert.equal(readFileSync(sentinelPath, "utf8"), sentinelContent);
      const request = async (path, body) => {
        const response = await fetch(`${demo.origin}${path}`, {
          method: body ? "POST" : "GET",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        assert.ok(response.ok, await response.clone().text());
        return response.json();
      };
      const rows = await request("/api/stock");
      assert.equal(rows.length, 12);
      const sortedRows = rows.toSorted((a, b) =>
        a.barcode.localeCompare(b.barcode),
      );
      for (const [index, row] of sortedRows.entries()) {
        assert.equal(row.barcode, `DEMO-${String(index + 1).padStart(3, "0")}`);
        assert.equal(row.paidQty, index < 4 ? 10 : index < 8 ? 0 : 8);
        assert.equal(row.creditQty, index < 4 ? 0 : index < 8 ? 12 : 7);
        assert.equal(row.unclassifiedQty, 0);
        assert.equal(row.physicalStock, row.paidQty + row.creditQty);
        assert.equal(row.reservedStock, 0);
      }
      const summary = await request("/api/stock/summary");
      assert.equal(summary.physicalStock, 148);
      assert.equal(summary.paidQty, 72);
      assert.equal(summary.creditQty, 76);
      assert.equal(summary.unclassifiedQty, 0);
      assert.equal(summary.totalValueCents, 10240000);
      assert.equal(summary.retailValueCents, 20480000);
      assert.equal(summary.wholesaleValueCents, 18432000);
      assert.equal(summary.supplierDebtCents, 3620000);
      assert.equal(summary.netRetailValueCents, 16860000);
      assert.deepEqual(summary.wholesaleReference, {
        listName: "General",
        quantity: 3,
        fallbackProductCount: 0,
      });
      const first = sortedRows[0];
      const second = sortedRows[4];
      for (const [qtyA, qtyB, tier, percent] of [
        [1, 1, null, 100],
        [1, 2, 3, 90],
        [3, 3, 6, 85],
        [6, 6, 12, 80],
      ]) {
        const preview = await request("/api/price-lists/preview", {
          items: [
            { productId: first.productId, qty: qtyA },
            { productId: second.productId, qty: qtyB },
          ],
        });
        assert.equal(preview.countedUnits, qtyA + qtyB);
        assert.equal(preview.globalMinimumQty, tier);
        for (const line of preview.lines) {
          const product = sortedRows.find(
            (row) => row.productId === line.itemId,
          );
          assert.equal(
            line.appliedPriceAmountCents,
            Math.round((product.priceAmountCents * percent) / 100),
          );
        }
      }
      assert.deepEqual(await request("/api/stock/summary"), summary);
      const db = new DatabaseSync(demo.databasePath, { readOnly: true });
      try {
        assert.equal(
          db.prepare("PRAGMA integrity_check").get().integrity_check,
          "ok",
        );
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM Product").get().n,
          12,
        );
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM Purchase").get().n,
          3,
        );
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM Sale").get().n, 0);
        assert.equal(
          db.prepare("SELECT COUNT(*) AS n FROM PriceListTier").get().n,
          3,
        );
      } finally {
        db.close();
      }
      const priceList = readFileSync(demo.priceListPath, "utf8");
      assert.match(priceList, /Desde 3/);
      assert.match(priceList, /Desde 6/);
      assert.match(priceList, /Desde 12/);
      assert.match(priceList, /DEMO-012/);
    } finally {
      await demo?.close();
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      for (const directory of [demo?.directory, sentinelDir].filter(Boolean)) {
        const target = realpathSync(directory);
        assert.equal(dirname(target), realpathSync(tmpdir()));
        assert.ok(
          basename(target).startsWith("vape-stock-demo-") ||
            basename(target).startsWith("vape-demo-sentinel-test-"),
        );
        rmSync(target, { recursive: true, force: true });
      }
    }
  },
);
