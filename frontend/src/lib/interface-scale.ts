export const DEFAULT_INTERFACE_SCALE = 100;
export const MIN_INTERFACE_SCALE = 50;
export const MAX_INTERFACE_SCALE = 150;
export const INTERFACE_SCALE_STEP = 5;

export function normalizeInterfaceScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INTERFACE_SCALE;

  return Math.min(
    MAX_INTERFACE_SCALE,
    Math.max(
      MIN_INTERFACE_SCALE,
      Math.round(value / INTERFACE_SCALE_STEP) * INTERFACE_SCALE_STEP,
    ),
  );
}

export function parseStoredInterfaceScale(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_INTERFACE_SCALE;
  return normalizeInterfaceScale(Number(value));
}
