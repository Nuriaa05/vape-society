import { describe, expect, it } from "vitest";

import {
  buildReportChartScale,
  getReportChartBar,
  getReportChartPosition,
} from "./report-chart";

describe("report chart scale", () => {
  it("starts positive series at zero and includes the largest amount", () => {
    const scale = buildReportChartScale([120, 375]);

    expect(scale.min).toBe(0);
    expect(scale.max).toBe(500);
    expect(getReportChartPosition(0, scale)).toBe(100);
    expect(getReportChartPosition(375, scale)).toBe(25);
  });

  it("places the origin above losses and includes the most negative amount", () => {
    const scale = buildReportChartScale([-120, -375]);

    expect(scale.min).toBe(-500);
    expect(scale.max).toBe(0);
    expect(getReportChartPosition(0, scale)).toBe(0);
    expect(getReportChartPosition(-375, scale)).toBe(75);
  });

  it("uses one proportional axis for unequal gains and losses", () => {
    const scale = buildReportChartScale([-80, 300]);

    expect(scale.min).toBe(-100);
    expect(scale.max).toBe(500);
    expect(getReportChartPosition(0, scale)).toBeCloseTo(83.333333);
    expect(getReportChartBar(300, scale)?.height).toBeCloseTo(50);
    expect(getReportChartBar(-60, scale)?.height).toBeCloseTo(10);
    expect(scale.ticks).toContain(0);
  });

  it("preserves cent amounts without rounding them to zero", () => {
    const scale = buildReportChartScale([-0.01, 0.03]);

    expect(scale.min).toBeCloseTo(-0.01);
    expect(scale.max).toBeCloseTo(0.05);
    expect(getReportChartBar(0.03, scale)?.height).toBeCloseTo(50);
    expect(getReportChartBar(-0.01, scale)?.height).toBeGreaterThan(0);
  });

  it.each([
    ["empty", []],
    ["all unavailable", [null, null]],
    ["all zero", [0, 0]],
  ] as const)("provides a non-degenerate range for %s series", (_, values) => {
    const scale = buildReportChartScale(values);

    expect(scale.min).toBe(0);
    expect(scale.max).toBe(1);
    expect(getReportChartPosition(0, scale)).toBe(100);
    expect(scale.ticks).toContain(0);
  });

  it("excludes missing values from the range without changing known amounts", () => {
    expect(buildReportChartScale([null, -40, 30, null])).toEqual(
      buildReportChartScale([-40, 30]),
    );
  });

  it.each([
    [120, 375],
    [-120, -375],
    [-80, 300],
    [-0.01, 0.03],
    [0, 0],
    [-1000, 0, 12500],
  ])("keeps values and ticks inside the plot for %j", (...values) => {
    const scale = buildReportChartScale(values);

    for (const value of [...values, ...scale.ticks, 0]) {
      expect(value).toBeGreaterThanOrEqual(scale.min);
      expect(value).toBeLessThanOrEqual(scale.max);
      expect(getReportChartPosition(value, scale)).toBeGreaterThanOrEqual(0);
      expect(getReportChartPosition(value, scale)).toBeLessThanOrEqual(100);
    }
    expect(new Set(scale.ticks).size).toBe(scale.ticks.length);
    expect(scale.ticks).toEqual([...scale.ticks].sort((a, b) => b - a));
  });
});

describe("report chart bars", () => {
  const symmetricScale = { min: -100, max: 100, ticks: [100, 0, -100] };

  it("draws a gain from its value down to zero", () => {
    expect(getReportChartBar(60, symmetricScale)).toEqual({
      top: 20,
      height: 30,
    });
  });

  it("draws a loss from zero down to its value", () => {
    expect(getReportChartBar(-60, symmetricScale)).toEqual({
      top: 50,
      height: 30,
    });
  });

  it("keeps zero as an available amount with no artificial bar", () => {
    expect(getReportChartBar(0, symmetricScale)).toEqual({
      top: 50,
      height: 0,
    });
  });

  it("does not turn unavailable amounts into zero", () => {
    expect(getReportChartBar(null, symmetricScale)).toBeNull();
  });

  it("keeps a larger gain visibly taller on the same axis", () => {
    const smaller = getReportChartBar(20, symmetricScale)!;
    const larger = getReportChartBar(80, symmetricScale)!;

    expect(larger.height).toBe(smaller.height * 4);
    expect(larger.top + larger.height).toBe(50);
    expect(smaller.top + smaller.height).toBe(50);
  });
});
