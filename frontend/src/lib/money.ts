export function parsePesosToAmountCents(input: string): number {
  const normalized = input.trim().replace(/\s|\$/g, "");

  if (!normalized) {
    throw new Error("El importe no puede estar vacío.");
  }

  const [pesosPart, centsPart = ""] = normalized.split(",");

  if (normalized.split(",").length > 2) {
    throw new Error("El importe tiene un formato inválido.");
  }

  const pesosDigits = pesosPart.replace(/\./g, "");
  const centsDigits = centsPart.padEnd(2, "0").slice(0, 2);

  if (!/^\d+$/.test(pesosDigits) || !/^\d{0,2}$/.test(centsPart)) {
    throw new Error("El importe tiene un formato inválido.");
  }

  return Number(pesosDigits) * 100 + Number(centsDigits || 0);
}

export function pesosToAmountCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("El importe debe ser un número válido.");
  }

  return Math.round(value * 100);
}

export function amountCentsToPesos(amountCents: number): number {
  if (!Number.isInteger(amountCents)) {
    throw new Error("El importe en centavos debe ser entero.");
  }

  return amountCents / 100;
}

export function formatAmountCentsAsARS(amountCents: number): string {
  if (!Number.isInteger(amountCents)) {
    throw new Error("El importe en centavos debe ser entero.");
  }

  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  const pesos = Math.floor(absolute / 100);
  const cents = absolute % 100;
  const formattedPesos = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return cents === 0
    ? `${sign}$${formattedPesos}`
    : `${sign}$${formattedPesos},${cents.toString().padStart(2, "0")}`;
}
