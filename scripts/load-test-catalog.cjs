const { existsSync, statSync } = require("node:fs");
const { basename, join } = require("node:path");

const productsPerCategory = 5;
const categories = [
  { name: "Pods descartables", product: "Pod descartable" },
  { name: "Pods recargables", product: "Pod recargable" },
  { name: "Vapeadores compactos", product: "Vapeador compacto" },
  { name: "Kits de inicio", product: "Kit de inicio" },
  { name: "Mods electrónicos", product: "Mod electrónico" },
  { name: "Atomizadores", product: "Atomizador" },
  { name: "Tanques", product: "Tanque" },
  { name: "Resistencias", product: "Resistencia" },
  { name: "Cartuchos", product: "Cartucho" },
  { name: "Boquillas", product: "Boquilla" },
  { name: "Líquidos frutales", product: "Líquido frutal" },
  { name: "Líquidos mentolados", product: "Líquido mentolado" },
  { name: "Líquidos dulces", product: "Líquido dulce" },
  { name: "Líquidos clásicos", product: "Líquido clásico" },
  { name: "Baterías", product: "Batería" },
  { name: "Cargadores", product: "Cargador" },
  { name: "Cables", product: "Cable" },
  { name: "Fundas", product: "Funda" },
  { name: "Estuches", product: "Estuche" },
  { name: "Accesorios de limpieza", product: "Accesorio de limpieza" },
];

async function loadTestCatalog(origin = "http://127.0.0.1:3002") {
  async function request(path, method = "GET", body) {
    const response = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const value = await response.json();
    if (!response.ok) {
      throw new Error(
        `${method} ${path}: ${response.status} ${JSON.stringify(value.message ?? value)}`,
      );
    }
    return value;
  }

  const ready = await request("/health/ready");
  if (ready.status !== "ready")
    throw new Error("El sistema todavía no está listo para cargar datos.");
  const [existingCategories, existingProducts] = await Promise.all([
    request("/api/settings/categories"),
    request("/api/products?includeArchived=true"),
  ]);
  const categoriesByName = new Map(
    existingCategories.map((category) => [category.name, category]),
  );
  const productsByBarcode = new Map(
    existingProducts.map((product) => [product.barcode, product]),
  );
  const plan = categories.map((category, categoryIndex) => {
    const name = `[PRUEBA] ${category.name}`;
    const existingCategory = categoriesByName.get(name);
    if (existingCategory && !existingCategory.active)
      throw new Error(`La categoría ${name} está desactivada.`);
    const products = Array.from(
      { length: productsPerCategory },
      (_, productIndex) => {
        const code = `${String(categoryIndex + 1).padStart(2, "0")}-${String(productIndex + 1).padStart(2, "0")}`;
        const barcode = `TEST-${code}`;
        const productName = `[PRUEBA] ${category.product} ${productIndex + 1}`;
        const existingProduct = productsByBarcode.get(barcode);
        if (
          existingProduct &&
          (existingProduct.name !== productName ||
            existingProduct.categoryId !== existingCategory?.id)
        ) {
          throw new Error(
            `El código ${barcode} ya pertenece a otro producto. No se modificaron los datos.`,
          );
        }
        const costAmountCents =
          (1500 + categoryIndex * 750 + productIndex * 250) * 100;
        const marginPct = 30 + productIndex * 5;
        return {
          name: productName,
          barcode,
          costAmountCents,
          priceAmountCents: Math.round(
            (costAmountCents * (100 + marginPct)) / 100,
          ),
          marginPct,
          physicalStock: [0, 3, 5, 20, 50][productIndex],
          minStock: 5,
        };
      },
    );
    return { name, existingCategory, products };
  });

  const summary = {
    categories: categories.length,
    products: categories.length * productsPerCategory,
    productsPerCategory,
    createdCategories: 0,
    createdProducts: 0,
    existingProducts: plan
      .flatMap((category) => category.products)
      .filter((product) => productsByBarcode.has(product.barcode)).length,
    backupPath: null,
  };
  if (
    plan.every((category) => category.existingCategory) &&
    summary.existingProducts === summary.products
  )
    return summary;

  // Finish and verify the backup before adding anything to the working catalog.
  const backup = await request("/api/backups", "POST", {});
  const location = await request("/api/backups/location");
  if (
    backup.status !== "Ok" ||
    backup.sizeBytes <= 0 ||
    !backup.filename ||
    basename(backup.filename) !== backup.filename
  ) {
    throw new Error(
      "No se pudo verificar el respaldo. No se cargaron los productos.",
    );
  }
  summary.backupPath = join(location.directory, backup.filename);
  if (
    !existsSync(summary.backupPath) ||
    !statSync(summary.backupPath).isFile() ||
    statSync(summary.backupPath).size !== backup.sizeBytes
  ) {
    throw new Error(
      "No se encontró el archivo de respaldo. No se cargaron los productos.",
    );
  }

  for (const category of plan) {
    let categoryRow = category.existingCategory;
    if (!categoryRow) {
      categoryRow = await request("/api/settings/categories", "POST", {
        name: category.name,
      });
      summary.createdCategories++;
    }
    for (const product of category.products) {
      if (productsByBarcode.has(product.barcode)) continue;
      const created = await request("/api/products", "POST", {
        ...product,
        categoryId: categoryRow.id,
      });
      productsByBarcode.set(created.barcode, created);
      summary.createdProducts++;
    }
  }

  const loadedProducts = await request("/api/products?includeArchived=true");
  for (const category of plan) {
    for (const product of category.products) {
      if (
        !loadedProducts.some(
          (loaded) =>
            loaded.barcode === product.barcode &&
            loaded.name === product.name &&
            loaded.category?.name === category.name,
        )
      ) {
        throw new Error(
          `No se pudo verificar el producto ${product.barcode}. Podés repetir el script para completar la carga.`,
        );
      }
    }
  }
  return summary;
}

module.exports = { loadTestCatalog };

if (require.main === module) {
  if (process.argv.length > 2) {
    console.error(
      "Uso: node scripts/load-test-catalog.cjs. El sistema debe estar abierto en http://127.0.0.1:3002.",
    );
    process.exitCode = 1;
  } else {
    loadTestCatalog()
      .then((summary) => console.log(JSON.stringify(summary, null, 2)))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}
