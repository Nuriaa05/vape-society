import { apiClient } from "./api-client";
import type { PageResult } from "./collections";
import type { CsvCell } from "./csv";
import { formatDateTimeAR } from "./formatters";
import { collectionsRepository } from "./repositories/collections-repository";
import { priceListsRepository } from "./repositories/price-lists-repository";
import { supplierPayablesRepository } from "./repositories/supplier-payables-repository";
import { productsRepository } from "./repositories/products-repository";
import { combosRepository } from "./repositories/combos-repository";
import { stockRepository } from "./repositories/stock-repository";

export const additionalDataExportOptions = [
  {
    id: "stock-summary",
    label: "Resumen de Stock",
    filename: "resumen-stock",
    description:
      "Valor al costo, minorista, mayorista, stock propio y deuda, con la misma referencia mayorista que Stock.",
  },
  {
    id: "sale-profits",
    label: "Ganancias por venta",
    filename: "ganancias-por-venta",
    description:
      "Todas las ventas entregadas, con fecha de entrega, costo histórico y ganancia; incluye operaciones anteriores al mes actual.",
  },
  {
    id: "customers",
    label: "Clientes",
    filename: "clientes",
    description:
      "Clientes activos y archivados, lista asignada y saldos separados de tarjetas.",
  },
  {
    id: "customer-plans",
    label: "Planes y saldos anteriores",
    filename: "planes-clientes",
    description:
      "Planes originales, saldos anteriores y anulaciones, sin generar ventas nuevas.",
  },
  {
    id: "customer-installments",
    label: "Cuotas de clientes",
    filename: "cuotas-clientes",
    description:
      "Todas las cuotas, con vencimientos, cobros aplicados, saldo y estado.",
  },
  {
    id: "collections",
    label: "Cobros registrados",
    filename: "cobros",
    description:
      "Cobros efectivos de contado, anticipos y cuotas; incluye reversiones.",
  },
  {
    id: "collection-allocations",
    label: "Aplicación de cobros a cuotas",
    filename: "aplicaciones-cobros",
    description:
      "Importes aplicados a cada cuota y vínculo con su cobro original.",
  },
  {
    id: "card-settlements",
    label: "Tarjetas por acreditar",
    filename: "tarjetas-acreditaciones-previstas",
    description:
      "Calendarios previstos, ventas por completar y saldos pendientes de acreditar.",
  },
  {
    id: "card-accreditations",
    label: "Acreditaciones recibidas",
    filename: "acreditaciones-recibidas",
    description: "Bruto liquidado, comisión real, neto recibido y reversiones.",
  },
  {
    id: "refunds",
    label: "Devoluciones a clientes",
    filename: "devoluciones-clientes",
    description:
      "Reintegros y egresos efectivos, separados de las acreditaciones canceladas.",
  },
  {
    id: "refund-sources",
    label: "Devoluciones pendientes y completadas",
    filename: "estado-devoluciones",
    description:
      "Operaciones anuladas con importes a devolver, devueltos y pendientes, aunque todavía no haya reintegros registrados.",
  },
  {
    id: "refund-cancellations",
    label: "Acreditaciones canceladas por devolución",
    filename: "cancelaciones-acreditaciones",
    description:
      "Cancelaciones de acreditaciones previstas; no representan egresos de dinero.",
  },
  {
    id: "supplier-payables",
    label: "Deudas con proveedores",
    filename: "deudas-proveedores",
    description:
      "Compras a crédito y saldos iniciales, vencimientos, pagos y reintegros a favor.",
  },
  {
    id: "supplier-payments",
    label: "Pagos a proveedores",
    filename: "pagos-proveedores",
    description:
      "Pagos efectivos por su fecha, con medio, referencia y reversiones.",
  },
  {
    id: "supplier-refunds",
    label: "Reintegros de proveedores",
    filename: "reintegros-proveedores",
    description: "Dinero recibido por compras anuladas y sus reversiones.",
  },
  {
    id: "inventory-lots",
    label: "Ingresos de mercadería por origen",
    filename: "ingresos-mercaderia",
    description:
      "Cantidades iniciales y restantes, clasificación y costo histórico de cada ingreso.",
  },
  {
    id: "inventory-allocations",
    label: "Asignaciones de stock FIFO",
    filename: "asignaciones-stock",
    description:
      "Unidades consumidas o restituidas a cada ingreso por ventas y ajustes.",
  },
  {
    id: "price-lists",
    label: "Listas de precios",
    filename: "listas-precios",
    description:
      "Listas activas y archivadas, incluida General y la cantidad de clientes que las usan.",
  },
  {
    id: "price-list-tiers",
    label: "Escalas de listas de precios",
    filename: "escalas-precios",
    description:
      "Todas las cantidades mínimas configuradas, incluso escalas sin precios cargados.",
  },
  {
    id: "price-list-prices",
    label: "Precios por lista y escala",
    filename: "precios-por-escala",
    description:
      "Precios configurados para productos y combos; las celdas vacías no se convierten en cero.",
  },
] as const;
export type AdditionalDataExportSection =
  (typeof additionalDataExportOptions)[number]["id"];

const calendarDate = (value?: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : null;
export function paymentTermsLabel(value?: string | null): string {
  if (value === "OpeningBalance") return "Saldo anterior";
  if (value === "Immediate") return "Contado";
  if (value === "DirectInstallments") return "Cuotas directas";
  if (value === "CardInstallments") return "Cuotas con tarjeta";
  return "Sin seguimiento financiero";
}

async function allPages<T>(
  load: (page: { take: number; skip: number }) => Promise<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = await load({ take: 500, skip: rows.length });
    rows.push(...page.items);
    if (!page.hasMore) return rows;
    if (!page.items.length)
      throw new Error(
        "La consulta quedó incompleta. Volvé a intentar la exportación.",
      );
  }
}

export async function loadAdditionalDataExport(
  section: AdditionalDataExportSection,
): Promise<CsvCell[][]> {
  switch (section) {
    case "stock-summary": {
      const summary = await stockRepository.summary();
      const reference = summary.wholesaleReference;
      const amount = (cents: number | null) =>
        cents === null ? "No disponible" : cents / 100;
      return [
        ["Indicador", "Importe ARS", "Referencia"],
        [
          "Valor stock al costo",
          amount(summary.totalValueCents),
          "Costos históricos de los ingresos",
        ],
        [
          "Valor minorista",
          amount(summary.retailValueCents),
          "Precio de venta habitual",
        ],
        [
          "Valor mayorista",
          amount(summary.wholesaleValueCents),
          reference
            ? `${reference.listName} · ${reference.quantity} unidades · ${reference.fallbackProductCount} productos con precio habitual`
            : "Sin lista de referencia",
        ],
        [
          "Stock propio",
          amount(summary.netRetailValueCents),
          "Valor minorista menos deuda con proveedores",
        ],
        [
          "Deuda",
          amount(summary.supplierDebtCents),
          "Saldo pendiente de proveedores",
        ],
      ];
    }
    case "customers": {
      const [customers, lists] = await Promise.all([
        allPages((page) =>
          collectionsRepository.findCustomers({
            ...page,
            includeInactive: true,
          }),
        ),
        priceListsRepository.findAll(true),
      ]);
      const names = new Map(lists.map((list) => [list.id, list.name]));
      const general = lists.find((list) => list.isGeneral);
      return [
        [
          "ID cliente",
          "Cliente",
          "Celular",
          "Notas",
          "Activo",
          "ID lista particular",
          "Lista aplicable",
          "Deuda del cliente ARS",
          "Deuda vencida ARS",
          "Tarjetas pendientes ARS",
          "Tarjetas por completar ARS",
          "Alta",
          "Última edición",
        ],
        ...customers.map((customer) => [
          customer.id,
          customer.name,
          customer.phone,
          customer.notes,
          customer.active,
          customer.priceListId,
          customer.priceListId
            ? names.get(customer.priceListId)
            : (general?.name ?? "General"),
          (customer.balanceAmountCents ?? 0) / 100,
          (customer.overdueAmountCents ?? 0) / 100,
          (customer.cardPendingAmountCents ?? 0) / 100,
          (customer.cardUnscheduledAmountCents ?? 0) / 100,
          customer.createdAt ? formatDateTimeAR(customer.createdAt) : null,
          customer.updatedAt ? formatDateTimeAR(customer.updatedAt) : null,
        ]),
      ];
    }
    case "customer-installments": {
      const installments = await allPages((page) =>
        collectionsRepository.installments(page),
      );
      return [
        [
          "ID cuota",
          "ID plan",
          "ID cliente",
          "Cliente",
          "ID venta",
          "Comprobante",
          "Concepto",
          "Cuota",
          "Vencimiento",
          "Importe ARS",
          "Cobrado ARS",
          "Saldo pendiente ARS",
          "Estado",
        ],
        ...installments.map((row) => [
          row.id,
          row.planId,
          row.customerId,
          row.customerName,
          row.saleId,
          row.saleNumber,
          row.title,
          row.number,
          calendarDate(row.dueDate),
          row.amountCents / 100,
          row.paidAmountCents / 100,
          row.remainingAmountCents / 100,
          row.status,
        ]),
      ];
    }
    case "card-settlements": {
      const settlements = await allPages((page) =>
        collectionsRepository.settlements(page),
      );
      return [
        [
          "ID acreditación prevista",
          "ID venta",
          "Comprobante",
          "ID cliente",
          "Cliente original",
          "Procesador",
          "Referencia",
          "Número",
          "Calendario por completar",
          "Vencimiento",
          "Bruto previsto ARS",
          "Comisión estimada ARS",
          "Neto estimado ARS",
          "Bruto acreditado ARS",
          "Neto recibido ARS",
          "Bruto cancelado ARS",
          "Bruto pendiente ARS",
          "Neto pendiente estimado ARS",
          "Estado",
        ],
        ...settlements.map((row) => [
          row.id,
          row.saleId,
          row.saleNumber,
          row.customerId,
          row.customerName,
          row.processor,
          row.reference,
          row.number || null,
          row.schedulePending,
          calendarDate(row.dueDate),
          row.grossAmountCents / 100,
          row.feeAmountCents === null ? null : row.feeAmountCents / 100,
          row.netAmountCents === null ? null : row.netAmountCents / 100,
          row.creditedGrossAmountCents / 100,
          row.creditedNetAmountCents / 100,
          row.cancelledGrossAmountCents / 100,
          row.remainingGrossAmountCents / 100,
          row.remainingNetAmountCents === null
            ? null
            : row.remainingNetAmountCents / 100,
          row.status,
        ]),
      ];
    }
    case "refund-sources": {
      const sources = await allPages((page) =>
        collectionsRepository.refunds(page),
      );
      return [
        [
          "ID venta",
          "ID plan",
          "ID cliente",
          "Cliente original",
          "Concepto",
          "Condición original",
          "Importe a devolver ARS",
          "Devuelto ARS",
          "Pendiente de devolver ARS",
        ],
        ...sources.map((row) => [
          row.saleId,
          row.planId,
          row.customerId,
          row.customerName,
          row.title,
          paymentTermsLabel(row.paymentTerms),
          row.refundableAmountCents / 100,
          row.refundedAmountCents / 100,
          row.pendingAmountCents / 100,
        ]),
      ];
    }
    case "supplier-payables":
    case "supplier-payments":
    case "supplier-refunds": {
      const payables = await allPages((page) =>
        supplierPayablesRepository.find(page),
      );
      if (section === "supplier-payables")
        return [
          [
            "ID deuda",
            "ID proveedor",
            "Proveedor",
            "ID compra",
            "Origen",
            "Concepto",
            "Vencimiento",
            "Importe original ARS",
            "Saldo pendiente ARS",
            "Reintegros a favor ARS",
            "Estado",
            "Motivo de anulación",
          ],
          ...payables.map((row) => [
            row.id,
            row.supplierId,
            row.supplierName,
            row.purchaseId,
            row.purchaseId ? "Compra" : "Saldo anterior",
            row.title,
            calendarDate(row.dueDate),
            row.amountCents / 100,
            row.balanceCents / 100,
            row.refundPendingCents / 100,
            row.status,
            row.cancelReason,
          ]),
        ];
      return [
        [
          section === "supplier-payments" ? "ID pago" : "ID reintegro",
          "ID deuda",
          "ID proveedor",
          "Proveedor",
          "ID compra",
          "Fecha",
          "Medio",
          "Referencia",
          "Importe ARS",
          "Revertido",
          "Fecha de reversión",
          "Motivo de reversión",
        ],
        ...payables.flatMap((row) =>
          (section === "supplier-payments" ? row.payments : row.refunds).map(
            (entry) => [
              entry.id,
              row.id,
              row.supplierId,
              row.supplierName,
              row.purchaseId,
              calendarDate(entry.date),
              entry.method,
              entry.reference,
              entry.amountCents / 100,
              !!entry.reversedAt,
              entry.reversedAt ? formatDateTimeAR(entry.reversedAt) : null,
              entry.reversalReason,
            ],
          ),
        ),
      ];
    }
    case "price-lists":
    case "price-list-tiers":
    case "price-list-prices": {
      const lists = await priceListsRepository.findAll(true);
      if (section === "price-lists") {
        const customers = await allPages((page) =>
          collectionsRepository.findCustomers({
            ...page,
            includeInactive: true,
          }),
        );
        return [
          [
            "ID lista",
            "Lista",
            "General",
            "Activa",
            "Clientes que la usan",
            "Cantidad de escalas",
          ],
          ...lists.map((list) => [
            list.id,
            list.name,
            list.isGeneral,
            list.active,
            customers.filter(
              (customer) =>
                customer.priceListId === list.id ||
                (!customer.priceListId && list.isGeneral),
            ).length,
            list.tiers.length,
          ]),
        ];
      }
      if (section === "price-list-tiers")
        return [
          [
            "ID lista",
            "Lista",
            "Lista activa",
            "Cantidad mínima",
            "Precios configurados",
          ],
          ...lists.flatMap((list) =>
            list.tiers.map((tier) => [
              list.id,
              list.name,
              list.active,
              tier.minimumQty,
              tier.prices.length,
            ]),
          ),
        ];
      const [products, combos] = await Promise.all([
        productsRepository.findAll(true),
        combosRepository.findAll(true),
      ]);
      const names = new Map([
        ...products.map(
          (product) => [`Product:${product.id}`, product.name] as const,
        ),
        ...combos.map((combo) => [`Combo:${combo.id}`, combo.name] as const),
      ]);
      return [
        [
          "ID lista",
          "Lista",
          "Lista activa",
          "Cantidad mínima",
          "Tipo",
          "ID producto o combo",
          "Producto o combo",
          "Precio ARS",
        ],
        ...lists.flatMap((list) =>
          list.tiers.flatMap((tier) =>
            tier.prices.map((price) => [
              list.id,
              list.name,
              list.active,
              tier.minimumQty,
              price.itemType === "Combo" ? "Combo" : "Producto",
              price.itemId,
              names.get(`${price.itemType}:${price.itemId}`),
              price.priceAmountCents / 100,
            ]),
          ),
        ),
      ];
    }
    default:
      return apiClient.get<CsvCell[][]>(`/data-exports/${section}`);
  }
}
