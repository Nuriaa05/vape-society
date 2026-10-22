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

test("builds historical scenarios without future days across February and year changes", () => {
  const { buildSalesScenarios } = require("./create-sales-demo.cjs");
  for (const today of ["2026-10-21", "2026-01-01", "2028-03-01"]) {
    const scenarios = buildSalesScenarios(today);
    assert.ok(scenarios.every((sale) => sale.day <= today));
    assert.equal(
      new Set(scenarios.map((sale) => sale.day.slice(0, 7))).size,
      6,
    );
    assert.equal(
      scenarios.filter((sale) => sale.status === "Pendiente").length,
      3,
    );
    assert.equal(
      scenarios.filter((sale) => sale.status === "Anulada").length,
      2,
    );
    assert.ok(scenarios.some((sale) => sale.day === today && sale.loss));
    assert.ok(scenarios.some((sale) => sale.combo));
    for (const sale of scenarios) {
      assert.equal(
        new Date(`${sale.day}T12:00:00Z`).toISOString().slice(0, 10),
        sale.day,
      );
    }
  }
});

test(
  "loads an isolated demo with complete FIFO costs and verifiable profit reports",
  { timeout: 180000 },
  async () => {
    const { createSalesDemo } = require("./create-sales-demo.cjs");
    const sentinelDirectory = mkdtempSync(
      join(tmpdir(), "vape-sales-sentinel-"),
    );
    const sentinel = join(sentinelDirectory, "existing.db");
    writeFileSync(sentinel, "No abrir ni modificar esta base.", "utf8");
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = `file:${sentinel.replaceAll("\\", "/")}`;
    let demo;
    try {
      demo = await createSalesDemo();
      assert.notEqual(demo.databasePath, sentinel);
      assert.equal(
        readFileSync(sentinel, "utf8"),
        "No abrir ni modificar esta base.",
      );
      assert.equal(
        demo.sales.filter((sale) => sale.deliveryStatus === "Pendiente").length,
        3,
      );
      assert.equal(
        demo.sales.filter((sale) => sale.status === "Anulada").length,
        2,
      );
      assert.ok(demo.sales.some((sale) => sale.profitAmountCents < 0));
      assert.ok(demo.sales.some((sale) => sale.countedUnits >= 12));
      assert.ok(demo.sales.some((sale) => sale.combo));
      const reports = demo.reports;
      assert.ok(reports.month.summary.profitAmountCents > 0);
      assert.equal(reports.month.summary.missingCostSalesCount, 0);
      for (const report of [
        reports.today,
        reports.month,
        reports.cuts,
        reports.months,
      ]) {
        const matching = demo.sales.filter(
          (sale) =>
            sale.status === "Confirmada" &&
            sale.deliveryStatus === "Entregado" &&
            sale.date >= report.from &&
            sale.date < report.to,
        );
        assert.equal(report.summary.salesCount, matching.length);
        for (const field of [
          "revenueAmountCents",
          "costAmountCents",
          "profitAmountCents",
        ]) {
          assert.equal(
            report.summary[field],
            matching.reduce((sum, sale) => sum + sale[field], 0),
          );
        }
        assert.equal(
          report.buckets.reduce(
            (sum, bucket) => sum + bucket.profitAmountCents,
            0,
          ),
          report.summary.profitAmountCents,
        );
      }
      assert.equal(
        reports.months.buckets.filter((bucket) => bucket.salesCount > 0).length,
        6,
      );
      assert.deepEqual(reports.month.summary, reports.cuts.summary);
      const response = await fetch(`${demo.origin}/api/reports/dashboard`);
      assert.ok(response.ok);
      assert.deepEqual(
        (await response.json()).todayProfit,
        reports.today.summary,
      );
      const stockResponse = await fetch(`${demo.origin}/api/stock/summary`);
      assert.ok(stockResponse.ok);
      assert.deepEqual(demo.summary, await stockResponse.json());
      const database = new DatabaseSync(demo.databasePath, { readOnly: true });
      try {
        assert.equal(
          database.prepare("PRAGMA integrity_check").get().integrity_check,
          "ok",
        );
        assert.deepEqual(
          database.prepare("PRAGMA foreign_key_check").all(),
          [],
        );
        assert.equal(
          database.prepare("SELECT COUNT(*) AS n FROM Product").get().n,
          12,
        );
        assert.equal(
          database.prepare("SELECT COUNT(*) AS n FROM Combo").get().n,
          2,
        );
        assert.equal(
          database.prepare("SELECT COUNT(*) AS n FROM Sale").get().n,
          demo.sales.length,
        );
        assert.equal(
          database
            .prepare(
              "SELECT COUNT(*) AS n FROM StockMovement WHERE unallocatedQty != 0",
            )
            .get().n,
          0,
        );
        const mismatch = database
          .prepare(
            "SELECT p.id FROM Product p WHERE p.physicalStock != (SELECT COALESCE(SUM(l.remainingQty), 0) FROM InventoryLot l WHERE l.productId = p.id)",
          )
          .all();
        assert.deepEqual(mismatch, []);
      } finally {
        database.close();
      }
      assert.match(readFileSync(demo.guidePath, "utf8"), /Cortes de 10 días/);
      const loss = demo.sales.find((sale) => sale.profitAmountCents < 0);
      assert.ok(
        readFileSync(demo.guidePath, "utf8").includes(
          `Comprobante ${loss.number}`,
        ),
      );
    } finally {
      await demo?.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      for (const directory of [demo?.directory, sentinelDirectory].filter(
        Boolean,
      )) {
        const target = realpathSync(directory);
        assert.equal(dirname(target), realpathSync(tmpdir()));
        assert.ok(
          basename(target).startsWith("vape-stock-demo-") ||
            basename(target).startsWith("vape-sales-sentinel-"),
        );
        rmSync(target, { recursive: true, force: true });
      }
    }
  },
);
