import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadCSV } from "@/lib/csv";
import {
  dataExportOptions,
  loadDataExport,
  type DataExportSection,
} from "@/lib/data-export";
import { TZ } from "@/lib/formatters";
import { getMutationErrorMessage } from "@/lib/mutation-errors";

export function DataExportControls() {
  const [section, setSection] = useState<DataExportSection>("products");
  const [exporting, setExporting] = useState(false);
  const selected = dataExportOptions.find((option) => option.id === section)!;

  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await loadDataExport(section);
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
        new Date(),
      );
      downloadCSV(`${selected.filename}-${date}.csv`, rows);
      toast.success(`CSV generado: ${rows.length - 1} registros.`);
    } catch (error) {
      toast.error(
        getMutationErrorMessage(
          error,
          "No se pudieron exportar los datos. Intentá nuevamente.",
        ),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <Label htmlFor="data-export-section">Sección</Label>
        <p
          id="data-export-description"
          className="mt-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {selected.description}
        </p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
        <Select
          value={section}
          onValueChange={(value) => setSection(value as DataExportSection)}
          disabled={exporting}
        >
          <SelectTrigger
            id="data-export-section"
            className="sm:w-60"
            aria-describedby="data-export-description"
          >
            <SelectValue placeholder="Seleccionar sección" />
          </SelectTrigger>
          <SelectContent>
            {dataExportOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          className="shrink-0"
          onClick={() => void exportData()}
          disabled={exporting}
        >
          {exporting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          {exporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>
    </div>
  );
}
