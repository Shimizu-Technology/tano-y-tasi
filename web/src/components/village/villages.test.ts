import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { villages } from "./villages";

it("includes all 19 villages with unique ASCII slugs and valid artwork fractions", () => {
  expect(villages).toHaveLength(19);
  expect(new Set(villages.map((village) => village.slug)).size).toBe(19);
  for (const village of villages) {
    expect(village.slug).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    expect(village.x).toBeGreaterThan(0);
    expect(village.x).toBeLessThan(1);
    expect(village.y).toBeGreaterThan(0);
    expect(village.y).toBeLessThan(1);
    expect(village.cropWidth).toBeGreaterThan(0);
  }
});

it("preserves the artwork names and search aliases", () => {
  expect(villages.map((village) => village.name)).toEqual([
    "Yigo", "Dededo", "Tamuning", "Barrigada", "Hagåtña", "Agana Heights", "Sinajana",
    "Mongmong-Toto-Maite", "Asan-Maina", "Chalan Pago-Ordot", "Mangilao", "Piti",
    "Santa Rita-Sumai", "Yona", "Hågat", "Talofofo", "Humåtak", "Inalåhan", "Malesso'",
  ]);
  expect(villages.find((village) => village.slug === "malesso")?.aliases).toContain("Merizo");
});

it("ships both responsive crops for every village", () => {
  for (const village of villages) {
    for (const width of [800, 1600]) {
      expect(existsSync(resolve("public", `.${village.cropBase}-${width}.webp`))).toBe(true);
    }
  }
});
