export type CsvCell = string | number | boolean | null | undefined;

export function serializeCSV(rows: CsvCell[][]): string {
  const escapeCell = (value: CsvCell): string => {
    let text =
      typeof value === "number"
        ? String(value).replace(".", ",")
        : typeof value === "boolean"
          ? value
            ? "Sí"
            : "No"
          : String(value ?? "");

    if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) {
      text = `'${text}`;
    }

    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return (
    "\uFEFF" +
    rows.map((row) => row.map(escapeCell).join(";")).join("\r\n") +
    "\r\n"
  );
}

export function downloadCSV(filename: string, rows: CsvCell[][]): void {
  const blob = new Blob([serializeCSV(rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
