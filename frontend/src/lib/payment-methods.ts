import type { PaymentMethodSetting, Sale } from "@/lib/contracts";

export function getAvailablePaymentMethods(
  methods: PaymentMethodSetting[],
): PaymentMethodSetting[] {
  return methods.filter((method) => method.enabled);
}

export function resolveSelectedPaymentMethodId(
  currentId: string,
  methods: PaymentMethodSetting[],
): string {
  const available = getAvailablePaymentMethods(methods);

  if (available.some((method) => method.id === currentId)) {
    return currentId;
  }

  return available[0]?.id ?? "";
}

export function getPaymentFilterOptions(
  methods: PaymentMethodSetting[],
  sales: Sale[],
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const method of methods) {
    const name = method.name.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      options.push(name);
    }
  }

  for (const sale of sales) {
    const name = sale.payment.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      options.push(name);
    }
  }

  return options;
}
