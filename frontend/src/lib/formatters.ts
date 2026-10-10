import { formatAmountCentsAsARS, pesosToAmountCents } from "@/lib/money";

export const formatARS = (n: number) =>
  formatAmountCentsAsARS(pesosToAmountCents(n));

export const TZ = "America/Argentina/Buenos_Aires";

export const formatDateInputAR = (d: Date | string = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof d === "string" ? new Date(d) : d);

  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
};

export const formatDateTimeAR = (d: Date | string = new Date()) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof d === "string" ? new Date(d) : d);

export const formatReceiptDateTimeAR = (d: Date | string = new Date()) =>
  formatDateTimeAR(d);

export const formatTimeAR = (d: Date | string = new Date()) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof d === "string" ? new Date(d) : d);

export const formatDateAR = (d: Date | string = new Date()) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(typeof d === "string" ? new Date(d) : d);

export const formatMonthYearAR = (d: Date | string = new Date()) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(typeof d === "string" ? new Date(d) : d);
