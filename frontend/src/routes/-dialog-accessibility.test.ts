import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function findMissingDescriptions(
  source: string,
  component: "Dialog" | "AlertDialog",
) {
  const contentPattern = new RegExp(
    `<${component}Content\\b[^>]*>([\\s\\S]*?)</${component}Content>`,
    "g",
  );
  const descriptionPattern = new RegExp(`<${component}Description\\b`);

  return [...source.matchAll(contentPattern)].filter(
    (match) => !descriptionPattern.test(match[1]),
  );
}

describe("dialog accessibility", () => {
  it("gives every Radix dialog an accessible description", () => {
    const pagesDirectory = path.join(__dirname, "-pages");
    const failures: string[] = [];

    for (const filename of readdirSync(pagesDirectory).filter((name) =>
      name.endsWith(".tsx"),
    )) {
      const source = readFileSync(path.join(pagesDirectory, filename), "utf8");

      for (const component of ["Dialog", "AlertDialog"] as const) {
        const missingCount = findMissingDescriptions(source, component).length;
        if (missingCount > 0) {
          failures.push(`${filename}: ${missingCount} ${component}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
