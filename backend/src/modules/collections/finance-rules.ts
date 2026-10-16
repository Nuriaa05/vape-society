import { BadRequestException } from "@nestjs/common";

export function businessToday(reference = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

export function validateBusinessDate(value: string, actual = false): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value ||
    (actual && value > businessToday())
  ) {
    throw new BadRequestException(
      "La fecha indicada no es válida o está en el futuro.",
    );
  }
  return value;
}

export function money(value: number, positive = false): number {
  if (
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 2_147_483_647
  )
    throw new BadRequestException(
      "El importe debe expresarse en centavos enteros válidos.",
    );
  return value;
}

export function monthlySchedule(
  amount: number,
  count: number,
  firstDate: string,
) {
  money(amount, true);
  validateBusinessDate(firstDate);
  if (!Number.isInteger(count) || count < 1 || count > 120 || amount < count)
    throw new BadRequestException("La cantidad de cuotas no es válida.");
  const [year, month, day] = firstDate.split("-").map(Number);
  const base = Math.floor(amount / count);
  return Array.from({ length: count }, (_, index) => {
    const lastDay = new Date(Date.UTC(year, month + index, 0)).getUTCDate();
    const date = new Date(
      Date.UTC(year, month - 1 + index, Math.min(day, lastDay)),
    );
    return {
      number: index + 1,
      dueDate: date.toISOString().slice(0, 10),
      amountCents: base + (index === count - 1 ? amount % count : 0),
    };
  });
}

export function validateAllocations(
  amount: number,
  allocations: Array<{ installmentId: string; amountCents: number }>,
) {
  money(amount, true);
  if (
    !allocations?.length ||
    new Set(allocations.map((a) => a.installmentId)).size !==
      allocations.length ||
    allocations.reduce((sum, a) => sum + money(a.amountCents, true), 0) !==
      amount
  )
    throw new BadRequestException(
      "Seleccione cuotas sin repetir y distribuya exactamente el importe cobrado.",
    );
}

export function canonicalPayload(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalPayload(v)}`)
    .join(",")}}`;
}
