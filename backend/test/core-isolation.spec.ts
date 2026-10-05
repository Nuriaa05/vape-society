import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("reusable database schema", () => {
  it("contains no food production tables or relations", () => {
    const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
    expect(schema).not.toMatch(/\b(?:Ingredient|Recipe|RecipeIngredient|RecipePresentation|RecipeProduction)\b/);
  });
});
