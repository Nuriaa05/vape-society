const MAX_BASIS_POINTS = 10_000;

export function basisPointsToPercentInput(basisPoints: number): string {
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > MAX_BASIS_POINTS
  ) {
    throw new Error("El recargo debe estar entre 0% y 100%.");
  }

  const whole = Math.floor(basisPoints / 100);
  const decimals = basisPoints % 100;

  if (decimals === 0) return String(whole);
  if (decimals % 10 === 0) return `${whole},${decimals / 10}`;

  return `${whole},${decimals.toString().padStart(2, "0")}`;
}

export function percentInputToBasisPoints(input: string): number {
  const normalized = input.trim();

  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized)) {
    throw new Error("Ingresá un porcentaje válido con hasta 2 decimales.");
  }

  const [wholePart, decimalPart = ""] = normalized.replace(".", ",").split(",");
  const basisPoints =
    Number(wholePart) * 100 + Number(decimalPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(basisPoints) || basisPoints > MAX_BASIS_POINTS) {
    throw new Error("El recargo debe estar entre 0% y 100%.");
  }

  return basisPoints;
}
