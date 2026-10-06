import { describe, expect, it } from "vitest";

import { serializeCSV } from "@/lib/csv";

describe("CSV export", () => {
  it("uses UTF-8 BOM, semicolon columns and decimal commas", () => {
    expect(
      serializeCSV([
        ["Producto", "Precio ARS", "Activo"],
        ["Artículo", 1250.5, true],
        ["Otro", 0, false],
      ]),
    ).toBe(
      "\uFEFFProducto;Precio ARS;Activo\r\nArtículo;1250,5;Sí\r\nOtro;0;No\r\n",
    );
  });

  it("keeps quotes, separators and multiline notes in one cell", () => {
    expect(
      serializeCSV([["Producto; variante", 'Nota "especial"\nSegunda línea']]),
    ).toBe('\uFEFF"Producto; variante";"Nota ""especial""\nSegunda línea"\r\n');
  });

  it("leaves missing optional customer data empty", () => {
    expect(serializeCSV([["000103", undefined, null, 0]])).toBe(
      "\uFEFF000103;;;0\r\n",
    );
  });

  it("treats text beginning with spreadsheet operators as text", () => {
    expect(serializeCSV([["=1+1", "+54362", "-nota", "@SUM(1)", -3]])).toBe(
      "\uFEFF'=1+1;'+54362;'-nota;'@SUM(1);-3\r\n",
    );
  });
});
