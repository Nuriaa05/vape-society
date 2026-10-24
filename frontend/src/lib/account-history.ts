export function normalizeHistorySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR");
}

export function paginateHistory<T>(rows: T[], requestedPage: number) {
  const total = rows.length;
  const pageCount = Math.ceil(total / 5);
  const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
  const offset = page * 5;
  return {
    rows: rows.slice(offset, offset + 5),
    total,
    page,
    pageCount,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + 5, total),
  };
}
