export type ReportChartPoint = {
  label: string;
  fullLabel: string;
  from: string;
  to: string;
  v: number | null;
};

export type ReportChartScale = {
  min: number;
  max: number;
  ticks: number[];
};

export function buildReportChartScale(
  values: readonly (number | null)[],
): ReportChartScale {
  let lowest = 0;
  let highest = 0;
  for (const value of values) {
    if (value === null) continue;
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  }

  const min = lowest < 0 ? -roundChartLimit(-lowest) : 0;
  const max = highest > 0 ? roundChartLimit(highest) : min < 0 ? 0 : 1;
  const span = max - min;
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((part) => Math.max(min, Math.min(max, max - span * part)))
    // Leave enough room for the zero label when the range crosses zero.
    .filter((value) => Math.abs(value) >= span * 0.12);

  return { min, max, ticks: [...ticks, 0].sort((a, b) => b - a) };
}

function roundChartLimit(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Vertical coordinate in percent, measured from the top of the plot. */
export function getReportChartPosition(
  value: number,
  scale: ReportChartScale,
): number {
  return Math.max(
    0,
    Math.min(100, ((scale.max - value) / (scale.max - scale.min)) * 100),
  );
}

export function getReportChartBar(
  value: number | null,
  scale: ReportChartScale,
): { top: number; height: number } | null {
  if (value === null) return null;
  const origin = getReportChartPosition(0, scale);
  const end = getReportChartPosition(value, scale);

  return { top: Math.min(origin, end), height: Math.abs(origin - end) };
}
