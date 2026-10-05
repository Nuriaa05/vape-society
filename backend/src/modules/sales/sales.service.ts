import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { ReceiptNumberService } from "../../domain/receipt-number.service";
import { StockRulesService } from "../../domain/stock-rules.service";
import { type SaleTotals, TotalsService } from "../../domain/totals.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  type CouponResponse,
  CouponsService,
} from "../coupons/coupons.service";
import { CancelSaleDto, CreateSaleDto } from "./dto/sale.dto";

const saleInclude = {
  paymentMethod: true,
  items: {
    include: {
      components: { orderBy: { productName: "asc" } },
    },
    orderBy: { productName: "asc" },
  },
} satisfies Prisma.SaleInclude;

const comboForSaleInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          barcode: true,
          name: true,
          priceAmountCents: true,
          archived: true,
        },
      },
    },
    orderBy: { product: { name: "asc" } },
  },
} satisfies Prisma.ComboInclude;

type SaleWithRelations = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;
type ComboForSale = Prisma.ComboGetPayload<{
  include: typeof comboForSaleInclude;
}>;

type RequestedSaleItem = {
  itemType: "Product" | "Combo";
  itemId: string;
  qty: number;
};

type StockRequirement = {
  productId: string;
  qty: number;
};

type PreparedSaleLine = {
  itemType: "Product" | "Combo";
  productId: string | null;
  comboId: string | null;
  productName: string;
  barcode: string;
  qty: number;
  unitPriceAmountCents: number;
  lineTotalAmountCents: number;
  comboDiscountAmountCents: number;
  components: Array<{
    productId: string;
    productName: string;
    barcode: string;
    qtyPerCombo: number;
    totalQty: number;
  }>;
};

type ProductForSale = {
  id: string;
  barcode: string | null;
  name: string;
  priceAmountCents: number;
  physicalStock: number;
  archived: boolean;
  saleEnabled: boolean;
};

type PaymentMethodForSale = {
  id: string;
  name: string;
  enabled: boolean;
  surchargeBasisPoints: number;
  cashHandling: boolean;
};

type SalePricingContext = {
  preparedLines: PreparedSaleLine[];
  stockRequirements: StockRequirement[];
  payment: PaymentMethodForSale;
  coupon: CouponResponse | null;
  totals: SaleTotals;
};

type CouponDiscountType = "Percentage" | "FixedAmount";

export type SalePricingResponse = {
  couponId: string | null;
  couponCode: string | null;
  couponType: CouponDiscountType | null;
  couponBasisPoints: number | null;
  couponValueAmountCents: number | null;
  subtotalAmountCents: number;
  discountAmountCents: number;
  netAmountCents: number;
  surchargeBasisPoints: number;
  surchargeAmountCents: number;
  totalAmountCents: number;
  cashReceivedAmountCents: number | null;
  changeAmountCents: number | null;
  cashShortfallAmountCents: number;
};

export type SaleResponse = SalePricingResponse & {
  id: string;
  number: string;
  date: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryStatus: string;
  status: string;
  paymentMethodId: string;
  payment: string;
  items: Array<{
    id: string;
    itemType: string;
    productId: string | null;
    comboId: string | null;
    productName: string;
    name: string;
    barcode: string;
    qty: number;
    unitPriceAmountCents: number;
    lineTotalAmountCents: number;
    comboDiscountAmountCents: number;
    components: Array<{
      productId: string;
      productName: string;
      name: string;
      barcode: string;
      qtyPerCombo: number;
      qty: number;
    }>;
  }>;
  cancelReason: string | null;
  cancelledAt: string | null;
};

export type ReceiptResponse = {
  business: {
    name: string;
    address: string;
    cuit: string;
    phone: string;
  };
  receipt: {
    header: string;
    footer: string;
  };
  sale: SaleResponse;
  items: SaleResponse["items"];
  totals: {
    subtotalAmountCents: number;
    discountAmountCents: number;
    netAmountCents: number;
    surchargeAmountCents: number;
    totalAmountCents: number;
    cashReceivedAmountCents: number | null;
    changeAmountCents: number | null;
  };
  legend: string;
};

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptNumberService: ReceiptNumberService,
    private readonly stockRulesService: StockRulesService,
    private readonly totalsService: TotalsService,
    private readonly couponsService: CouponsService,
  ) {}

  async findAll(
    options: { take?: number; skip?: number } = {},
  ): Promise<SaleResponse[]> {
    const sales = await this.prisma.sale.findMany({
      include: saleInclude,
      // El desempate por id mantiene estable la paginacion entre paginas
      // cuando varias ventas comparten la misma fecha.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...(options.take !== undefined ? { take: options.take } : {}),
      ...(options.skip !== undefined ? { skip: options.skip } : {}),
    });

    return sales.map((sale) => this.serializeSale(sale));
  }

  async findById(id: string): Promise<SaleResponse> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: saleInclude,
    });

    if (!sale) {
      throw new NotFoundException("Venta no encontrada.");
    }

    return this.serializeSale(sale);
  }

  async quote(dto: CreateSaleDto): Promise<SalePricingResponse> {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.preparePricingContext(tx, dto);
      return this.serializePricingContext(context);
    });
  }

  async create(dto: CreateSaleDto): Promise<SaleResponse> {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.preparePricingContext(tx, dto);
      this.assertCashForCreation(context);
      const number = await this.receiptNumberService.nextSaleNumber(tx);

      const sale = await tx.sale.create({
        data: {
          number,
          customerName: dto.customerName?.trim() || null,
          customerPhone: dto.customerPhone?.trim() || null,
          deliveryStatus: dto.deliveryStatus,
          status: "Confirmada",
          paymentMethodId: context.payment.id,
          paymentMethodName: context.payment.name,
          couponId: context.coupon?.id ?? null,
          couponCode: context.coupon?.code ?? null,
          couponType: context.coupon?.discountType ?? null,
          couponBasisPoints: context.coupon?.discountBasisPoints ?? null,
          couponValueAmountCents: context.coupon?.discountAmountCents ?? null,
          discountAmountCents: context.totals.discountAmountCents,
          surchargeBasisPoints: context.payment.surchargeBasisPoints,
          surchargeAmountCents: context.totals.surchargeAmountCents,
          cashReceivedAmountCents: context.payment.cashHandling
            ? dto.cashReceivedAmountCents!
            : null,
          changeAmountCents: context.payment.cashHandling
            ? context.totals.changeAmountCents
            : null,
          subtotalAmountCents: context.totals.subtotalAmountCents,
          totalAmountCents: context.totals.totalAmountCents,
          items: {
            create: context.preparedLines.map((line) => ({
              itemType: line.itemType,
              productId: line.productId,
              comboId: line.comboId,
              productName: line.productName,
              barcode: line.barcode,
              qty: line.qty,
              unitPriceAmountCents: line.unitPriceAmountCents,
              lineTotalAmountCents: line.lineTotalAmountCents,
              comboDiscountAmountCents: line.comboDiscountAmountCents,
              components:
                line.components.length > 0
                  ? {
                      create: line.components,
                    }
                  : undefined,
            })),
          },
        },
        include: saleInclude,
      });

      if (dto.deliveryStatus === "Entregado") {
        await this.applyDeliveredStock(tx, sale.id, context.stockRequirements);
      }

      return this.serializeSale(sale);
    });
  }

  async deliver(id: string): Promise<SaleResponse> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.loadSaleInTransaction(tx, id);

      if (sale.status !== "Confirmada") {
        throw new ConflictException("La venta no está confirmada.");
      }

      if (sale.deliveryStatus !== "Pendiente") {
        throw new ConflictException("La venta no está pendiente de entrega.");
      }

      const stockRequirements = this.getStockRequirementsFromSale(sale);
      await this.applyDeliveredStock(tx, sale.id, stockRequirements);

      const updated = await tx.sale.update({
        where: { id },
        data: { deliveryStatus: "Entregado" },
        include: saleInclude,
      });

      return this.serializeSale(updated);
    });
  }

  async cancel(id: string, dto: CancelSaleDto): Promise<SaleResponse> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.loadSaleInTransaction(tx, id);
      const cancelReason = dto.reason?.trim() || null;

      if (sale.status === "Anulada") {
        throw new ConflictException("La venta ya está anulada.");
      }

      if (sale.deliveryStatus === "Entregado") {
        await this.restoreDeliveredStock(
          tx,
          sale.id,
          this.getStockRequirementsFromSale(sale),
        );
      }

      const updated = await tx.sale.update({
        where: { id },
        data: {
          status: "Anulada",
          cancelReason,
          cancelledAt: new Date(),
        },
        include: saleInclude,
      });

      return this.serializeSale(updated);
    });
  }

  async getReceiptData(id: string): Promise<ReceiptResponse> {
    const [sale, business, receipt] = await Promise.all([
      this.prisma.sale.findUnique({ where: { id }, include: saleInclude }),
      this.prisma.businessSettings.findUnique({ where: { id: "default" } }),
      this.prisma.receiptSettings.findUnique({ where: { id: "default" } }),
    ]);

    if (!sale) {
      throw new NotFoundException("Venta no encontrada.");
    }

    if (!business || !receipt) {
      throw new NotFoundException(
        "La configuración del comprobante no está cargada.",
      );
    }

    const serializedSale = this.serializeSale(sale);

    return {
      business: {
        name: business.name,
        address: business.address,
        cuit: business.cuit,
        phone: business.phone,
      },
      receipt: {
        header: receipt.header,
        footer: receipt.footer,
      },
      sale: serializedSale,
      items: serializedSale.items,
      totals: {
        subtotalAmountCents: sale.subtotalAmountCents,
        discountAmountCents: sale.discountAmountCents,
        netAmountCents: sale.subtotalAmountCents - sale.discountAmountCents,
        surchargeAmountCents: sale.surchargeAmountCents,
        totalAmountCents: sale.totalAmountCents,
        cashReceivedAmountCents: sale.cashReceivedAmountCents,
        changeAmountCents: sale.changeAmountCents,
      },
      legend: "Comprobante interno no válido como factura fiscal.",
    };
  }

  private async preparePricingContext(
    tx: Prisma.TransactionClient,
    dto: CreateSaleDto,
  ): Promise<SalePricingContext> {
    const requestedItems = this.aggregateRequestedItems(dto.items);
    const payment = await this.resolvePaymentMethod(tx, dto.paymentMethodId);

    if (!payment.cashHandling && dto.cashReceivedAmountCents !== undefined) {
      throw new BadRequestException(
        "No se puede informar dinero recibido para este medio de pago.",
      );
    }

    const [preparedLines, coupon] = await Promise.all([
      this.prepareSaleLines(tx, requestedItems),
      dto.couponCode === undefined
        ? Promise.resolve(null)
        : this.couponsService.findEnabledByCode(dto.couponCode, tx),
    ]);
    const stockRequirements = this.aggregateStockRequirements(
      this.getStockRequirements(preparedLines),
    );

    await this.assertAvailableStock(tx, stockRequirements, {
      allowNegativeStock: dto.allowNegativeStock === true,
    });

    const totals = this.totalsService.calculateSaleTotals(preparedLines, {
      coupon,
      surchargeBasisPoints: payment.surchargeBasisPoints,
      cashReceivedAmountCents: payment.cashHandling
        ? dto.cashReceivedAmountCents
        : null,
    });

    return {
      preparedLines,
      stockRequirements,
      payment,
      coupon,
      totals,
    };
  }

  private assertCashForCreation(context: SalePricingContext): void {
    if (!context.payment.cashHandling) {
      return;
    }

    if (context.totals.cashReceivedAmountCents === null) {
      throw new BadRequestException(
        "Debe indicar el dinero recibido para el pago en efectivo.",
      );
    }

    if (context.totals.cashShortfallAmountCents > 0) {
      throw new BadRequestException(
        "El dinero recibido no alcanza para completar la venta.",
      );
    }
  }

  private aggregateRequestedItems(
    items: CreateSaleDto["items"],
  ): RequestedSaleItem[] {
    const byItem = new Map<string, RequestedSaleItem>();

    for (const item of items) {
      if (item.qty <= 0) {
        throw new BadRequestException("La cantidad debe ser positiva.");
      }

      const itemType = item.itemType ?? "Product";
      const itemId = item.itemId ?? item.productId;

      if (!itemId) {
        throw new BadRequestException(
          "La línea de venta no tiene producto o combo.",
        );
      }

      const key = `${itemType}:${itemId}`;
      const current = byItem.get(key);
      byItem.set(key, {
        itemType,
        itemId,
        qty: (current?.qty ?? 0) + item.qty,
      });
    }

    return [...byItem.values()];
  }

  private async resolvePaymentMethod(
    tx: Prisma.TransactionClient,
    paymentMethodId: string,
  ): Promise<PaymentMethodForSale> {
    const paymentMethod = await tx.paymentMethod.findUnique({
      where: { id: paymentMethodId },
      select: {
        id: true,
        name: true,
        enabled: true,
        surchargeBasisPoints: true,
        cashHandling: true,
      },
    });

    if (!paymentMethod || !paymentMethod.enabled) {
      throw new BadRequestException("El medio de pago indicado no existe.");
    }

    return paymentMethod;
  }

  private async prepareSaleLines(
    tx: Prisma.TransactionClient,
    items: RequestedSaleItem[],
  ): Promise<PreparedSaleLine[]> {
    const productItems = items.filter((item) => item.itemType === "Product");
    const comboItems = items.filter((item) => item.itemType === "Combo");
    const [products, combos] = await Promise.all([
      this.loadProductsForSale(
        tx,
        productItems.map((item) => item.itemId),
      ),
      this.loadCombosForSale(
        tx,
        comboItems.map((item) => item.itemId),
      ),
    ]);

    return items.map((item) => {
      if (item.itemType === "Product") {
        const product = products.get(item.itemId);
        if (!product) {
          throw new NotFoundException("Producto no encontrado.");
        }

        return {
          itemType: "Product",
          productId: product.id,
          comboId: null,
          productName: product.name,
          barcode: product.barcode ?? "",
          qty: item.qty,
          unitPriceAmountCents: product.priceAmountCents,
          lineTotalAmountCents: item.qty * product.priceAmountCents,
          comboDiscountAmountCents: 0,
          components: [],
        };
      }

      const combo = combos.get(item.itemId);
      if (!combo) {
        throw new NotFoundException("Combo no encontrado.");
      }

      const productsTotalAmountCents = combo.items.reduce(
        (sum, comboItem) =>
          sum + comboItem.qty * comboItem.product.priceAmountCents,
        0,
      );
      const discountPerCombo = Math.max(
        0,
        productsTotalAmountCents - combo.priceAmountCents,
      );

      return {
        itemType: "Combo",
        productId: null,
        comboId: combo.id,
        productName: combo.name,
        barcode: combo.barcode ?? "",
        qty: item.qty,
        unitPriceAmountCents: combo.priceAmountCents,
        lineTotalAmountCents: item.qty * combo.priceAmountCents,
        comboDiscountAmountCents: item.qty * discountPerCombo,
        components: combo.items.map((comboItem) => ({
          productId: comboItem.productId,
          productName: comboItem.product.name,
          barcode: comboItem.product.barcode ?? "",
          qtyPerCombo: comboItem.qty,
          totalQty: comboItem.qty * item.qty,
        })),
      };
    });
  }

  private async loadProductsForSale(
    tx: Prisma.TransactionClient,
    productIds: string[],
  ): Promise<Map<string, ProductForSale>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        barcode: true,
        name: true,
        priceAmountCents: true,
        physicalStock: true,
        archived: true,
        saleEnabled: true,
      },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const productId of productIds) {
      const product = productsById.get(productId);

      if (!product) {
        throw new NotFoundException("Producto no encontrado.");
      }

      if (product.archived) {
        throw new BadRequestException("El producto indicado está archivado.");
      }

      if (!product.saleEnabled) {
        throw new BadRequestException(
          "El producto indicado no está habilitado para venta.",
        );
      }
    }

    return productsById;
  }

  private async loadCombosForSale(
    tx: Prisma.TransactionClient,
    comboIds: string[],
  ): Promise<Map<string, ComboForSale>> {
    if (comboIds.length === 0) {
      return new Map();
    }

    const combos = await tx.combo.findMany({
      where: { id: { in: comboIds } },
      include: comboForSaleInclude,
    });
    const combosById = new Map(combos.map((combo) => [combo.id, combo]));

    for (const comboId of comboIds) {
      const combo = combosById.get(comboId);

      if (!combo) {
        throw new NotFoundException("Combo no encontrado.");
      }

      if (combo.archived) {
        throw new BadRequestException("El combo indicado está archivado.");
      }

      if (combo.items.length === 0) {
        throw new BadRequestException("El combo no tiene productos cargados.");
      }

      if (combo.items.some((item) => item.product.archived)) {
        throw new BadRequestException(
          "El combo contiene productos archivados.",
        );
      }
    }

    return combosById;
  }

  private getStockRequirements(lines: PreparedSaleLine[]): StockRequirement[] {
    return lines.flatMap((line) =>
      line.itemType === "Product" && line.productId
        ? [{ productId: line.productId, qty: line.qty }]
        : line.components.map((component) => ({
            productId: component.productId,
            qty: component.totalQty,
          })),
    );
  }

  private getStockRequirementsFromSale(
    sale: SaleWithRelations,
  ): StockRequirement[] {
    return this.aggregateStockRequirements(
      sale.items.flatMap((item) =>
        item.itemType === "Product" && item.productId
          ? [{ productId: item.productId, qty: item.qty }]
          : item.components.map((component) => ({
              productId: component.productId,
              qty: component.totalQty,
            })),
      ),
    );
  }

  private aggregateStockRequirements(
    requirements: StockRequirement[],
  ): StockRequirement[] {
    const byProduct = new Map<string, number>();

    for (const requirement of requirements) {
      byProduct.set(
        requirement.productId,
        (byProduct.get(requirement.productId) ?? 0) + requirement.qty,
      );
    }

    return [...byProduct.entries()].map(([productId, qty]) => ({
      productId,
      qty,
    }));
  }

  private async assertAvailableStock(
    tx: Prisma.TransactionClient,
    requirements: StockRequirement[],
    options: { allowNegativeStock: boolean },
  ): Promise<void> {
    if (options.allowNegativeStock) {
      return;
    }

    const productIds = requirements.map((item) => item.productId);
    const [reservedByProduct, products] = await Promise.all([
      this.stockRulesService.getReservedStockByProductIds(productIds, tx),
      tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, physicalStock: true },
      }),
    ]);
    const physicalByProduct = new Map(
      products.map((product) => [product.id, product.physicalStock]),
    );

    for (const requirement of requirements) {
      const physicalStock = physicalByProduct.get(requirement.productId);
      if (physicalStock === undefined) {
        throw new NotFoundException("Producto no encontrado.");
      }

      const reservedStock = reservedByProduct.get(requirement.productId) ?? 0;
      const availableStock = physicalStock - reservedStock;

      if (requirement.qty > availableStock) {
        throw new ConflictException("Stock disponible insuficiente.");
      }
    }
  }

  private async applyDeliveredStock(
    tx: Prisma.TransactionClient,
    saleId: string,
    requirements: StockRequirement[],
  ): Promise<void> {
    for (const requirement of requirements) {
      await tx.product.update({
        where: { id: requirement.productId },
        data: { physicalStock: { decrement: requirement.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: requirement.productId,
          type: "Venta",
          sourceType: "Sale",
          sourceId: saleId,
          physicalDelta: -requirement.qty,
        },
      });
    }
  }

  private async restoreDeliveredStock(
    tx: Prisma.TransactionClient,
    saleId: string,
    requirements: StockRequirement[],
  ): Promise<void> {
    const originalMovements = await tx.stockMovement.findMany({
      where: {
        sourceType: "Sale",
        sourceId: saleId,
        type: "Venta",
      },
      select: { id: true, productId: true },
    });
    const originalByProduct = new Map(
      originalMovements.map((movement) => [movement.productId, movement.id]),
    );

    for (const requirement of requirements) {
      await tx.product.update({
        where: { id: requirement.productId },
        data: { physicalStock: { increment: requirement.qty } },
      });
      await tx.stockMovement.create({
        data: {
          productId: requirement.productId,
          type: "Reverso",
          sourceType: "Sale",
          sourceId: saleId,
          physicalDelta: requirement.qty,
          reversalOfId: originalByProduct.get(requirement.productId),
        },
      });
    }
  }

  private async loadSaleInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<SaleWithRelations> {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: saleInclude,
    });

    if (!sale) {
      throw new NotFoundException("Venta no encontrada.");
    }

    return sale;
  }

  private serializePricingContext(
    context: SalePricingContext,
  ): SalePricingResponse {
    return {
      couponId: context.coupon?.id ?? null,
      couponCode: context.coupon?.code ?? null,
      couponType: context.coupon?.discountType ?? null,
      couponBasisPoints: context.coupon?.discountBasisPoints ?? null,
      couponValueAmountCents: context.coupon?.discountAmountCents ?? null,
      subtotalAmountCents: context.totals.subtotalAmountCents,
      discountAmountCents: context.totals.discountAmountCents,
      netAmountCents: context.totals.netAmountCents,
      surchargeBasisPoints: context.payment.surchargeBasisPoints,
      surchargeAmountCents: context.totals.surchargeAmountCents,
      totalAmountCents: context.totals.totalAmountCents,
      cashReceivedAmountCents: context.totals.cashReceivedAmountCents,
      changeAmountCents: context.totals.changeAmountCents,
      cashShortfallAmountCents: context.totals.cashShortfallAmountCents,
    };
  }

  private serializeSale(sale: SaleWithRelations): SaleResponse {
    return {
      id: sale.id,
      number: sale.number,
      date: sale.date.toISOString(),
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      deliveryStatus: sale.deliveryStatus,
      status: sale.status,
      paymentMethodId: sale.paymentMethodId,
      payment: sale.paymentMethodName || sale.paymentMethod.name,
      items: sale.items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        productId: item.productId,
        comboId: item.comboId,
        productName: item.productName,
        name: item.productName,
        barcode: item.barcode,
        qty: item.qty,
        unitPriceAmountCents: item.unitPriceAmountCents,
        lineTotalAmountCents: item.lineTotalAmountCents,
        comboDiscountAmountCents: item.comboDiscountAmountCents,
        components: item.components.map((component) => ({
          productId: component.productId,
          productName: component.productName,
          name: component.productName,
          barcode: component.barcode,
          qtyPerCombo: component.qtyPerCombo,
          qty: component.totalQty,
        })),
      })),
      couponId: sale.couponId,
      couponCode: sale.couponCode,
      couponType: this.parseCouponType(sale.couponType),
      couponBasisPoints: sale.couponBasisPoints,
      couponValueAmountCents: sale.couponValueAmountCents,
      subtotalAmountCents: sale.subtotalAmountCents,
      discountAmountCents: sale.discountAmountCents,
      netAmountCents: sale.subtotalAmountCents - sale.discountAmountCents,
      surchargeBasisPoints: sale.surchargeBasisPoints,
      surchargeAmountCents: sale.surchargeAmountCents,
      totalAmountCents: sale.totalAmountCents,
      cashReceivedAmountCents: sale.cashReceivedAmountCents,
      changeAmountCents: sale.changeAmountCents,
      cashShortfallAmountCents: 0,
      cancelReason: sale.cancelReason,
      cancelledAt: sale.cancelledAt?.toISOString() ?? null,
    };
  }

  private parseCouponType(value: string | null): CouponDiscountType | null {
    return value === "Percentage" || value === "FixedAmount" ? value : null;
  }
}
