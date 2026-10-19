import type { CsvCell } from "@/lib/csv";
import { formatDateTimeAR } from "@/lib/formatters";
import {
  additionalDataExportOptions,
  loadAdditionalDataExport,
  paymentTermsLabel,
  type AdditionalDataExportSection,
} from "./data-export-sections";
import {
  combosRepository,
  couponsRepository,
  historyRepository,
  productsRepository,
  purchasesRepository,
  salesRepository,
  settingsRepository,
  stockRepository,
  suppliersRepository,
} from "@/lib/repositories";
import type { Product, Sale, Supplier } from "@/lib/contracts";
import type { HistoryEvent, HistoryEventType } from "@/lib/repositories";
import { supplierPayablesRepository } from "./repositories/supplier-payables-repository";

export type DataExportSection =
  | AdditionalDataExportSection
  | "products"
  | "stock"
  | "sales"
  | "sale-items"
  | "combos"
  | "combo-items"
  | "purchases"
  | "purchase-items"
  | "suppliers"
  | "stock-movements"
  | "history"
  | "categories"
  | "payment-methods"
  | "coupons"
  | "settings";

export const dataExportOptions: Array<{
  id: DataExportSection;
  label: string;
  filename: string;
  description: string;
}> = [
  {
    id: "products",
    label: "Productos",
    filename: "productos",
    description:
      "Catálogo completo, incluidos archivados, con categoría, proveedor y precios.",
  },
  {
    id: "stock",
    label: "Stock actual",
    filename: "stock",
    description:
      "Cantidades físicas, reservas y valuación al costo por mercadería pagada, a crédito y sin clasificar.",
  },
  {
    id: "sales",
    label: "Ventas",
    filename: "ventas",
    description:
      "Una fila por venta, con condiciones financieras y lista de precios originales; un cobro no se suma como otra venta.",
  },
  {
    id: "sale-items",
    label: "Detalle de ventas",
    filename: "detalle-ventas",
    description:
      "Una fila por producto o combo vendido, vinculada al comprobante.",
  },
  {
    id: "combos",
    label: "Combos",
    filename: "combos",
    description: "Combos activos y archivados, con sus precios y descuentos.",
  },
  {
    id: "combo-items",
    label: "Componentes de combos",
    filename: "componentes-combos",
    description: "Productos y cantidades que componen cada combo.",
  },
  {
    id: "purchases",
    label: "Compras",
    filename: "compras",
    description:
      "Una fila por compra, con registro, condición de pago, deuda y pagos efectivos separados.",
  },
  {
    id: "purchase-items",
    label: "Detalle de compras",
    filename: "detalle-compras",
    description:
      "Productos comprados, cantidades y costos históricos, vinculados a la compra.",
  },
  {
    id: "suppliers",
    label: "Proveedores",
    filename: "proveedores",
    description: "Proveedores activos e inactivos, con contacto y notas.",
  },
  {
    id: "stock-movements",
    label: "Movimientos de stock",
    filename: "movimientos-stock",
    description: "Todos los movimientos, con cantidades, origen y anulaciones.",
  },
  {
    id: "history",
    label: "Historial",
    filename: "historial",
    description: "Todos los movimientos de todos los meses con actividad.",
  },
  {
    id: "categories",
    label: "Categorías",
    filename: "categorias",
    description: "Listado de categorías registradas.",
  },
  {
    id: "payment-methods",
    label: "Métodos de pago",
    filename: "metodos-pago",
    description:
      "Medios de pago, recargos, efectivo y habilitación para cuotas y cobranzas.",
  },
  {
    id: "coupons",
    label: "Cupones",
    filename: "cupones",
    description: "Códigos, tipo de descuento, valores y estado.",
  },
  {
    id: "settings",
    label: "Configuración del local",
    filename: "configuracion",
    description:
      "Datos del local, formato del comprobante y valores predeterminados.",
  },
  ...additionalDataExportOptions,
];

const historyTypeLabels: Record<HistoryEventType, string> = {
  sales: "Ventas",
  purchases: "Compras",
  products: "Productos",
  stock: "Stock",
  suppliers: "Proveedores",
  combos: "Combos",
  settings: "Configuración",
  backups: "Backups",
  customers: "Clientes",
  collections: "Cobranzas",
};

function calendarDate(value: string): string {
  if (!value || value === "-") return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function buildProductExportRows(
  products: Product[],
  suppliers: Supplier[],
  stockOnly = false,
): CsvCell[][] {
  const supplierNames = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.name]),
  );
  if (stockOnly) {
    return [
      [
        "ID producto",
        "Código de barras",
        "Producto",
        "Categoría",
        "Proveedor",
        "Stock físico",
        "Stock reservado",
        "Stock disponible",
        "Stock mínimo",
        "Archivado",
        "Unidades pagadas",
        "Valor pagado ARS",
        "Unidades a crédito",
        "Valor a crédito ARS",
        "Unidades sin clasificar",
        "Valor sin clasificar ARS",
        "Valor total al costo ARS",
      ],
      ...products.map((product) => [
        product.id,
        product.barcode,
        product.name,
        product.category,
        supplierNames.get(product.supplierId) ?? "",
        product.stock,
        product.reservedStock ?? 0,
        product.availableStock ?? product.stock,
        product.minStock,
        product.archived ?? false,
        product.paidQty ?? null,
        product.paidValueCents == null ? null : product.paidValueCents / 100,
        product.creditQty ?? null,
        product.creditValueCents == null
          ? null
          : product.creditValueCents / 100,
        product.unclassifiedQty ?? null,
        product.unclassifiedValueCents == null
          ? null
          : product.unclassifiedValueCents / 100,
        product.totalValueCents == null ? null : product.totalValueCents / 100,
      ]),
    ];
  }
  return [
    [
      "ID producto",
      "Código de barras",
      "Producto",
      "ID categoría",
      "Categoría",
      "ID proveedor",
      "Proveedor",
      "Costo ARS",
      "Ganancia %",
      "Precio de venta ARS",
      "Stock físico",
      "Stock mínimo",
      "Archivado",
    ],
    ...products.map((product) => [
      product.id,
      product.barcode,
      product.name,
      product.categoryId,
      product.category,
      product.supplierId,
      supplierNames.get(product.supplierId) ?? "",
      product.cost,
      product.marginPct,
      product.price,
      product.stock,
      product.minStock,
      product.archived ?? false,
    ]),
  ];
}

export function buildSalesExportRows(sales: Sale[]): CsvCell[][] {
  return [
    [
      "ID venta",
      "Comprobante",
      "Fecha y hora",
      "Cliente",
      "Celular",
      "Pago",
      "Entrega",
      "Estado",
      "Unidades",
      "Ítems",
      "Subtotal ARS",
      "Descuento ARS",
      "Neto ARS",
      "Recargo %",
      "Recargo ARS",
      "Total ARS",
      "Cupón",
      "Efectivo recibido ARS",
      "Vuelto ARS",
      "Motivo de anulación",
      "ID cliente",
      "Condición de pago",
      "Anticipo ARS",
      "Financiado ARS",
      "Cuotas directas",
      "Primer vencimiento",
      "Calendario de cuotas",
      "Cuotas con tarjeta",
      "Procesador",
      "Referencia tarjeta",
      "Calendario de acreditaciones original",
      "ID lista original",
      "Lista original",
      "Unidades computadas",
      "Escala alcanzada",
    ],
    ...sales.map((sale) => [
      sale.id,
      sale.number,
      formatDateTimeAR(sale.date),
      sale.customerName,
      sale.customerPhone,
      sale.payment,
      sale.delivery,
      sale.status,
      sale.items.reduce((sum, item) => sum + item.qty, 0),
      sale.items.map((item) => `${item.qty}x ${item.name}`).join(" | "),
      sale.subtotal,
      sale.discount,
      sale.net,
      (sale.surchargeBasisPoints ?? 0) / 100,
      sale.surcharge,
      sale.total,
      sale.couponCode,
      sale.cashReceived,
      sale.change,
      sale.cancelReason,
      sale.customerId,
      paymentTermsLabel(sale.paymentTerms),
      sale.finance ? sale.finance.upfrontAmountCents / 100 : null,
      sale.finance ? sale.finance.financedAmountCents / 100 : null,
      sale.paymentTerms === "DirectInstallments"
        ? (sale.finance?.installments.length ?? null)
        : null,
      sale.finance?.installments[0]
        ? calendarDate(sale.finance.installments[0].dueDate)
        : null,
      sale.finance?.installments
        .map(
          (row) =>
            `${row.number}: ${calendarDate(row.dueDate)} · ARS ${(row.amountCents / 100).toFixed(2).replace(".", ",")}`,
        )
        .join(" | ") ?? null,
      sale.finance?.cardPlan?.installmentCount ?? null,
      sale.finance?.cardPlan?.processor ?? null,
      sale.finance?.cardPlan?.reference ?? null,
      sale.paymentTerms === "CardInstallments"
        ? sale.finance?.cardPlan?.settlements.length
          ? sale.finance.cardPlan.settlements
              .map(
                (row) =>
                  `${row.number}: ${calendarDate(row.dueDate)} · bruto ARS ${(row.grossAmountCents / 100).toFixed(2).replace(".", ",")}`,
              )
              .join(" | ")
          : "Por completar"
        : null,
      sale.pricingSnapshot?.listId ?? null,
      sale.pricingSnapshot?.listName ?? null,
      sale.pricingSnapshot?.countedUnits ?? null,
      sale.pricingSnapshot?.globalMinimumQty ?? null,
    ]),
  ];
}

export async function loadDataExport(
  section: DataExportSection,
): Promise<CsvCell[][]> {
  switch (section) {
    case "products":
    case "stock": {
      const [products, suppliers] = await Promise.all([
        section === "stock"
          ? stockRepository.getPhysicalStock()
          : productsRepository.findAll(true),
        suppliersRepository.findAll(),
      ]);
      return buildProductExportRows(products, suppliers, section === "stock");
    }
    case "sales": {
      const sales = await salesRepository.findAll();
      return buildSalesExportRows(sales);
    }
    case "sale-items": {
      const sales = await salesRepository.findAll();
      return [
        [
          "ID venta",
          "Comprobante",
          "Fecha y hora",
          "Estado",
          "Entrega",
          "Tipo",
          "ID producto o combo",
          "Producto o combo",
          "Cantidad",
          "Precio unitario ARS",
          "Subtotal del ítem ARS",
          "Descuento del combo ARS",
          "Componentes del combo",
          "Lista original",
          "Precio habitual original ARS",
          "Origen del precio",
          "Escala del precio aplicado",
        ],
        ...sales.flatMap((sale) =>
          sale.items.map((item) => {
            const pricing = sale.pricingSnapshot?.lines.find(
              (line) =>
                line.itemType === (item.itemType ?? "Product") &&
                line.itemId === (item.comboId ?? item.productId),
            );
            return [
              sale.id,
              sale.number,
              formatDateTimeAR(sale.date),
              sale.status,
              sale.delivery,
              item.itemType === "Combo" ? "Combo" : "Producto",
              item.comboId ?? item.productId,
              item.name,
              item.qty,
              item.price,
              Math.round(item.qty * item.price * 100) / 100,
              item.comboDiscount ?? 0,
              item.components
                ?.map(
                  (component) => `${component.qty}x ${component.productName}`,
                )
                .join(" | ") ?? "",
              sale.pricingSnapshot?.listName ?? null,
              pricing ? pricing.basePriceAmountCents / 100 : null,
              pricing
                ? pricing.origin === "List"
                  ? "Lista"
                  : "Precio habitual"
                : null,
              pricing?.effectiveMinimumQty ?? null,
            ];
          }),
        ),
      ];
    }
    case "combos": {
      const combos = await combosRepository.findAll(true);
      return [
        [
          "ID combo",
          "Código de barras",
          "Combo",
          "Valor de productos ARS",
          "Precio de venta ARS",
          "Descuento ARS",
          "Archivado",
        ],
        ...combos.map((combo) => [
          combo.id,
          combo.barcode,
          combo.name,
          combo.productsTotal,
          combo.price,
          combo.discount,
          combo.archived ?? false,
        ]),
      ];
    }
    case "combo-items": {
      const combos = await combosRepository.findAll(true);
      return [
        [
          "ID combo",
          "Combo",
          "Archivado",
          "ID producto",
          "Producto",
          "Código de barras",
          "Cantidad por combo",
        ],
        ...combos.flatMap((combo) =>
          combo.items.map((item) => [
            combo.id,
            combo.name,
            combo.archived ?? false,
            item.productId,
            item.productName,
            item.barcode,
            item.qty,
          ]),
        ),
      ];
    }
    case "purchases": {
      const [purchases, suppliers] = await Promise.all([
        purchasesRepository.findAll(),
        suppliersRepository.findAll(),
      ]);
      const supplierNames = new Map(
        suppliers.map((supplier) => [supplier.id, supplier.name]),
      );
      return [
        [
          "ID compra",
          "Fecha",
          "ID proveedor",
          "Proveedor",
          "Estado",
          "Unidades",
          "Total ARS",
          "Motivo de anulación",
          "Condición de pago",
          "Vencimiento",
          "Estado del pago",
          "ID deuda",
          "Saldo pendiente ARS",
          "Pagado ARS",
          "Fecha de último pago",
          "Reintegros a favor ARS",
        ],
        ...purchases.map((purchase) => [
          purchase.id,
          calendarDate(purchase.date),
          purchase.supplierId,
          supplierNames.get(purchase.supplierId) ?? "",
          purchase.status ?? "Pendiente",
          purchase.items.reduce((sum, item) => sum + item.qty, 0),
          purchase.total,
          purchase.cancelReason,
          purchase.paymentCondition === "Credito"
            ? "A crédito"
            : purchase.paymentCondition === "Pagada"
              ? "Pagada"
              : "Sin seguimiento financiero",
          purchase.dueDate ? calendarDate(purchase.dueDate) : null,
          purchase.payable?.status ??
            (purchase.status === "Pendiente" ? "Sin registrar" : null),
          purchase.payable?.id,
          purchase.payable ? purchase.payable.balanceCents / 100 : null,
          purchase.payable
            ? purchase.payable.payments
                .filter((payment) => !payment.reversedAt)
                .reduce((sum, payment) => sum + payment.amountCents, 0) / 100
            : null,
          calendarDate(
            purchase.payable?.payments
              .filter((payment) => !payment.reversedAt)
              .map((payment) => payment.date)
              .sort()
              .at(-1) ?? "",
          ),
          purchase.payable ? purchase.payable.refundPendingCents / 100 : null,
        ]),
      ];
    }
    case "purchase-items": {
      const purchases = await purchasesRepository.findAll();
      return [
        [
          "ID compra",
          "Fecha",
          "Estado",
          "ID producto",
          "Producto",
          "Cantidad",
          "Costo unitario ARS",
          "Subtotal del ítem ARS",
        ],
        ...purchases.flatMap((purchase) =>
          purchase.items.map((item) => [
            purchase.id,
            calendarDate(purchase.date),
            purchase.status ?? "Pendiente",
            item.productId,
            item.name,
            item.qty,
            item.cost,
            Math.round(item.qty * item.cost * 100) / 100,
          ]),
        ),
      ];
    }
    case "suppliers": {
      const [suppliers, payables] = await Promise.all([
        suppliersRepository.findAll(),
        supplierPayablesRepository.all(),
      ]);
      return [
        [
          "ID proveedor",
          "Proveedor",
          "Celular",
          "Correo",
          "Última compra",
          "Activo",
          "Notas",
          "Deuda pendiente ARS",
          "Deuda vencida ARS",
          "Próximo vencimiento pendiente",
          "Reintegros a favor ARS",
        ],
        ...suppliers.map((supplier) => {
          const debts = payables.filter(
            (row) => row.supplierId === supplier.id,
          );
          return [
            supplier.id,
            supplier.name,
            supplier.phone,
            supplier.email,
            calendarDate(supplier.lastPurchase),
            supplier.active,
            supplier.notes,
            debts.reduce((sum, row) => sum + row.balanceCents, 0) / 100,
            debts.reduce(
              (sum, row) =>
                sum + (row.status === "Vencida" ? row.balanceCents : 0),
              0,
            ) / 100,
            calendarDate(
              debts
                .filter((row) => row.balanceCents > 0)
                .map((row) => row.dueDate)
                .sort()[0] ?? "",
            ),
            debts.reduce((sum, row) => sum + row.refundPendingCents, 0) / 100,
          ];
        }),
      ];
    }
    case "stock-movements": {
      const movements = await stockRepository.findAll();
      return [
        [
          "ID movimiento",
          "Fecha y hora",
          "ID producto",
          "Producto",
          "Tipo",
          "Cantidad",
          "Tipo de origen",
          "ID origen",
          "Nota",
          "Anulado",
          "Reverso de",
        ],
        ...movements.map((movement) => [
          movement.id,
          movement.date,
          movement.productId,
          movement.productName,
          movement.type,
          movement.qty,
          movement.sourceType,
          movement.sourceId,
          movement.note,
          movement.reversed ?? false,
          movement.reversalOf,
        ]),
      ];
    }
    case "history": {
      const months = await historyRepository.getMonths();
      const events: HistoryEvent[] = [];
      for (const month of months) {
        const page = await historyRepository.findAllMatching({
          month: month.month,
        });
        events.push(...page.items);
      }
      return [
        [
          "ID movimiento",
          "Fecha y hora",
          "Sección",
          "Título",
          "Detalle",
          "ID relacionado",
          "Importe ARS",
          "Cantidad",
          "Estado",
        ],
        ...events.map((event) => [
          event.id,
          formatDateTimeAR(event.occurredAt),
          historyTypeLabels[event.type],
          event.title,
          event.description,
          event.entityId,
          event.amount,
          event.quantity,
          event.status,
        ]),
      ];
    }
    case "categories": {
      const categories = await settingsRepository.findCategories();
      return [
        ["ID categoría", "Categoría"],
        ...categories.map((category) => [category.id, category.name]),
      ];
    }
    case "payment-methods": {
      const methods = await settingsRepository.findPaymentMethods();
      return [
        [
          "ID método",
          "Método de pago",
          "Habilitado",
          "Recargo %",
          "Manejo de efectivo",
          "Admite cuotas con tarjeta",
          "Habilitado para cobranzas",
        ],
        ...methods.map((method) => [
          method.id,
          method.name,
          method.enabled,
          method.surchargeBasisPoints / 100,
          method.cashHandling,
          method.supportsInstallments ?? false,
          method.collectionEligible ?? false,
        ]),
      ];
    }
    case "coupons": {
      const coupons = await couponsRepository.findAll();
      return [
        [
          "ID cupón",
          "Código",
          "Tipo de descuento",
          "Descuento %",
          "Descuento ARS",
          "Habilitado",
        ],
        ...coupons.map((coupon) => [
          coupon.id,
          coupon.code,
          coupon.discountType === "Percentage" ? "Porcentaje" : "Monto fijo",
          coupon.discountBasisPoints == null
            ? null
            : coupon.discountBasisPoints / 100,
          coupon.discountAmount,
          coupon.enabled,
        ]),
      ];
    }
    case "settings": {
      const settings = await settingsRepository.getSettings();
      return [
        ["Sección", "Campo", "Valor"],
        ["Datos del local", "Nombre", settings.business.name],
        ["Datos del local", "Dirección", settings.business.address],
        ["Datos del local", "CUIT", settings.business.cuit],
        ["Datos del local", "Teléfono", settings.business.phone],
        ["Comprobante", "Pie", settings.receipt.footer],
        [
          "Comprobante",
          "Formato de combos",
          settings.comboTicketMode === "ComboWithComponents"
            ? "Combo con componentes"
            : "Una línea de combo",
        ],
        [
          "Precios",
          "Margen de ganancia predeterminado %",
          settings.defaultMargin,
        ],
      ];
    }
    default:
      return loadAdditionalDataExport(section);
  }
}
