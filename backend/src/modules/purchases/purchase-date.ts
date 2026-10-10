import { BadRequestException } from "@nestjs/common";

const purchaseDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function resolvePurchaseDate(value?: string, now = new Date()): Date {
  const parts = purchaseDayFormatter.formatToParts(now);
  const input =
    value ??
    ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)!.value)
      .join("-");
  const isCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(input);
  // A selected day starts at 00:00 in Argentina; explicit ISO timestamps keep their time.
  const date = new Date(isCalendarDate ? `${input}T00:00:00-03:00` : input);

  if (
    !Number.isFinite(date.getTime()) ||
    (isCalendarDate && date.toISOString().slice(0, 10) !== input)
  ) {
    throw new BadRequestException("La fecha de compra no es válida.");
  }

  return date;
}
