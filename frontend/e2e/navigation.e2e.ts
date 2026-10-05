import { expect, test } from "playwright/test";

const routes = [
  { path: "/productos", label: "Productos", heading: "Productos" },
  { path: "/combos", label: "Combos", heading: "Combos" },
  { path: "/stock", label: "Stock", heading: "Stock" },
  { path: "/configuracion", label: "Configuraci", heading: "Configuraci" },
] as const;

test("navigates between the main sections without blocking the page", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  for (const route of routes) {
    await page.locator("aside button", { hasText: route.label }).click();
    await expect(page).toHaveURL(new RegExp(`${route.path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      route.heading,
    );
  }

  expect(pageErrors).toEqual([]);
});

test("keeps in-page router links responsive", async ({ page }) => {
  await page.goto("/");

  await page.locator('header a[href="/compras"]').click();

  await expect(page).toHaveURL(/\/compras$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Compras");
});
