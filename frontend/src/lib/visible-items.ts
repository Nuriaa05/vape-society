export const DASHBOARD_PREVIEW_LIMIT = 5;
export const PAGE_LIST_INCREMENT = 10;
export const REPORT_PREVIEW_INCREMENT = 5;

export function getVisibleItems<T>(
  items: readonly T[],
  visibleCount: number,
): T[] {
  return items.slice(0, Math.max(0, visibleCount));
}

export function getNextVisibleCount(
  current: number,
  increment: number,
  total: number,
): number {
  void current;
  void increment;
  return Math.max(0, total);
}

export function canShowMore(current: number, total: number): boolean {
  return current < total;
}

export function canShowLess(
  current: number,
  initialCount: number,
  total: number,
): boolean {
  return total > initialCount && current >= total;
}
