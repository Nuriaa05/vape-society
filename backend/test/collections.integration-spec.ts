import { CollectionsService } from "../src/modules/collections/collections.service";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createSeededTestDatabase,
  SeededTestDatabase,
} from "./prisma-test-database";

describe("collections financial ledger", () => {
  let db: SeededTestDatabase;
  let service: CollectionsService;
  let customerId: string;
  beforeAll(async () => {
    db = await createSeededTestDatabase();
    service = new CollectionsService(db.prisma as PrismaService);
    await db.prisma.paymentMethod.update({
      where: { id: "pm1" },
      data: { collectionEligible: true },
    });
    customerId = (await service.createCustomer({ name: "Cliente prueba" })).id;
  });
  afterAll(async () => db?.cleanup());
  it("filters debtors before pagination and excludes paid, reversed and cancelled balances correctly", async () => {
    const prefix = "Filtro deudores ";
    const empty = await service.createCustomer({ name: prefix + "A al día" });
    const overdue = await service.createCustomer({
      name: prefix + "B vencido",
    });
    const future = await service.createCustomer({ name: prefix + "C futuro" });
    const cancelled = await service.createCustomer({
      name: prefix + "D anulado",
    });
    const opening = (id: string, date: string) =>
      service.createOpeningBalance(id, {
        operationId: `filter-${id}`,
        title: "Saldo anterior",
        totalAmountCents: 10000,
        installmentCount: 1,
        firstDueDate: date,
      });
    const plan = await opening(overdue.id, "2020-01-01");
    await opening(future.id, "2099-01-01");
    const cancelledPlan = await opening(cancelled.id, "2020-01-01");
    await service.cancelPlan(cancelled.id, cancelledPlan.id, "Error de carga");
    const filters = { q: prefix, debtStatus: "withDebt" as const, take: 1 };
    const first = await service.listCustomers(filters);
    expect(first).toMatchObject({ total: 2, hasMore: true });
    expect(first.items[0]).toMatchObject({
      id: overdue.id,
      overdueAmountCents: 10000,
    });
    const second = await service.listCustomers({ ...filters, skip: 1 });
    expect(second.items[0]).toMatchObject({
      id: future.id,
      overdueAmountCents: 0,
    });
    expect(second.hasMore).toBe(false);
    expect(
      (
        await service.listCustomers({ q: prefix, debtStatus: "overdue" })
      ).items.map((c) => c.id),
    ).toEqual([overdue.id]);
    const paid = await service.createCollection({
      operationId: "filter-payment",
      customerId: overdue.id,
      date: "2020-01-01",
      paymentMethodId: "pm1",
      amountCents: 10000,
      cashReceivedAmountCents: 10000,
      allocations: [
        { installmentId: plan.installments[0].id, amountCents: 10000 },
      ],
    });
    expect(
      (await service.listCustomers({ q: prefix, debtStatus: "overdue" })).total,
    ).toBe(0);
    await service.reverseCollection(paid.id, "Corregir pago");
    await service.updateCustomer(overdue.id, { active: false });
    expect(
      (await service.listCustomers({ q: prefix, debtStatus: "overdue" })).total,
    ).toBe(0);
    expect(
      (
        await service.listCustomers({
          q: prefix,
          debtStatus: "overdue",
          includeInactive: "true",
        })
      ).items[0].id,
    ).toBe(overdue.id);
    expect(
      (await service.listCustomers({ q: empty.name })).items[0]
        .balanceAmountCents,
    ).toBe(0);
  });
  it("allows selected installments across plans but rejects another customer's installment", async () => {
    const own = (await service.createCustomer({ name: "Dos planes" })).id;
    const other = (await service.createCustomer({ name: "Otro cliente" })).id;
    const create = (id: string, operationId: string) =>
      service.createOpeningBalance(id, {
        operationId,
        title: operationId,
        totalAmountCents: 10000,
        installmentCount: 1,
        firstDueDate: "2020-01-31",
      });
    const first = await create(own, "multi-first");
    const second = await create(own, "multi-second");
    const foreign = await create(other, "multi-foreign");
    const stockBefore = await db.prisma.product.findMany({
      select: { id: true, physicalStock: true },
    });
    const data = {
      operationId: "multi-collection",
      customerId: own,
      date: "2020-01-31",
      paymentMethodId: "pm1",
      amountCents: 12000,
      cashReceivedAmountCents: 12000,
      allocations: [
        { installmentId: first.installments[0].id, amountCents: 8000 },
        { installmentId: second.installments[0].id, amountCents: 4000 },
      ],
    };
    await expect(
      service.createCollection({
        ...data,
        operationId: "cross-customer",
        allocations: [
          data.allocations[0],
          { installmentId: foreign.installments[0].id, amountCents: 4000 },
        ],
      }),
    ).rejects.toThrow();
    const collection = await service.createCollection(data);
    expect((await service.account(own)).balanceAmountCents).toBe(8000);
    expect((await service.createCollection(data)).id).toBe(collection.id);
    await expect(
      service.createCollection({ ...data, date: "2020-02-01" }),
    ).rejects.toThrow();
    expect(
      await db.prisma.product.findMany({
        select: { id: true, physicalStock: true },
      }),
    ).toEqual(stockBefore);
    await service.reverseCollection(collection.id, "Corrección");
    expect((await service.account(own)).balanceAmountCents).toBe(20000);
  });
  it("records opening debt with no sale and collects only explicitly allocated balances", async () => {
    const plan = await service.createOpeningBalance(customerId, {
      operationId: "opening-1",
      title: "Saldo inicial",
      totalAmountCents: 10001,
      installmentCount: 3,
      firstDueDate: "2020-01-31",
    });
    expect(await db.prisma.sale.count()).toBe(0);
    const rows = (await service.listInstallments({ customerId })).items;
    expect(rows.map((r) => r.amountCents)).toEqual([3333, 3333, 3335]);
    const dto = {
      operationId: "pay-1",
      customerId,
      date: "2020-02-01",
      paymentMethodId: "pm1",
      amountCents: 4000,
      cashReceivedAmountCents: 5000,
      allocations: [
        { installmentId: rows[0].id, amountCents: 3333 },
        { installmentId: rows[2].id, amountCents: 667 },
      ],
    };
    const collection = await service.createCollection(dto);
    expect((await service.createCollection(dto)).id).toBe(collection.id);
    await expect(
      service.createCollection({ ...dto, amountCents: 3999 }),
    ).rejects.toThrow();
    expect(
      (await service.getSummary({ customerId })).customerDebtAmountCents,
    ).toBe(6001);
    const listed = await service.listCustomers({ take: 1 });
    expect(listed.items[0]).toMatchObject({
      id: customerId,
      balanceAmountCents: 6001,
    });
    expect(
      (await service.getSummary({ customerId, month: "2020-01" }))
        .monthCommitmentsAmountCents,
    ).toBe(0);
    await expect(
      service.createCollection({ ...dto, operationId: "overpay" }),
    ).rejects.toThrow();
    await service.cancelPlan(customerId, plan.id, "Anulación del saldo");
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    expect(
      (await service.listRefunds({ customerId, month: currentMonth })).total,
    ).toBe(1);
    await service.createRefund({
      operationId: "refund-1",
      planId: plan.id,
      date: "2020-02-02",
      amountCents: 1000,
      cashOutAmountCents: 1000,
      paymentMethodId: "pm1",
      reason: "Devolución parcial",
    });
    await expect(
      service.reverseCollection(collection.id, "Error"),
    ).rejects.toThrow();
    expect(
      (await service.listRefunds({ customerId })).items[0].pendingAmountCents,
    ).toBe(3000);
  });
});
