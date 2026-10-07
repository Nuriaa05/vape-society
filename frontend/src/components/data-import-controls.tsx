import { LoaderCircle, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import {
  backupsRepository,
  type DatabaseImportPreview,
  type DatabaseImportResult,
} from "@/lib/repositories/backups-repository";

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const countLabels: Record<keyof DatabaseImportPreview["counts"], string> = {
  products: "Productos",
  combos: "Combos",
  sales: "Ventas",
  purchases: "Compras",
  suppliers: "Proveedores",
  movements: "Movimientos de stock",
};

export function DataImportControls({
  backupDirectory,
}: {
  backupDirectory?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<DatabaseImportPreview>();
  const [filename, setFilename] = useState("");
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<DatabaseImportResult>();
  const [error, setError] = useState("");

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || validating) return;
    setError("");
    if (file.size === 0 || file.size > MAX_IMPORT_BYTES) {
      setError(
        file.size === 0
          ? "El archivo está vacío."
          : "El respaldo no puede superar los 50 MB.",
      );
      return;
    }
    setValidating(true);
    try {
      const validated = await backupsRepository.validateImport(file);
      setFilename(file.name);
      setPreview(validated);
    } catch (error) {
      setError(
        getMutationErrorMessage(
          error,
          "No se pudo validar el archivo. Intentá nuevamente.",
        ),
      );
    } finally {
      setValidating(false);
    }
  };

  const closePreview = (open: boolean) => {
    if (open || importing) return;
    if (result) {
      window.location.reload();
      return;
    }
    if (preview)
      void backupsRepository.discardImport(preview.id).catch(() => undefined);
    setPreview(undefined);
    setError("");
  };

  const importData = async () => {
    if (!preview || importing) return;
    setImporting(true);
    setError("");
    try {
      setResult(await backupsRepository.confirmImport(preview.id));
    } catch (error) {
      setError(
        getMutationErrorMessage(
          error,
          "Se perdió la conexión. Recargá la página para revisar los datos antes de continuar.",
        ),
      );
      if (error instanceof ApiError && error.status === 404)
        setPreview(undefined);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="border-t border-border pt-5">
      <h3 className="app-card-title font-semibold text-foreground">
        Importar base de datos
      </h3>
      <p
        id="data-import-description"
        className="mt-1 text-sm text-muted-foreground"
      >
        Reemplaza los datos actuales después de validar el archivo.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".db,.sqlite,.sqlite3"
        aria-label="Seleccionar respaldo de la base de datos"
        className="hidden"
        onChange={(event) => void selectFile(event)}
      />
      <Button
        ref={importButton}
        type="button"
        className="mt-4"
        aria-describedby="data-import-description data-import-format"
        disabled={validating || importing || !!preview}
        onClick={() => fileInput.current?.click()}
      >
        {validating ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : (
          <Upload aria-hidden="true" />
        )}
        {validating ? "Validando archivo..." : "Importar datos"}
      </Button>
      <p id="data-import-format" className="mt-2 text-xs text-muted-foreground">
        Respaldo SQLite de este sistema (.db, .sqlite o .sqlite3), hasta 50 MB.
      </p>
      {error && !preview && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <AlertDialog open={!!preview} onOpenChange={closePreview}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            importButton.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {result ? "Datos importados" : "¿Reemplazar los datos actuales?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {result
                ? "La importación terminó. Se guardó una copia de los datos anteriores."
                : "Se reemplazarán los productos, ventas, stock y configuración actuales. Antes de importar se creará una copia de seguridad."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {result ? (
            <div className="min-w-0 space-y-2 text-sm">
              <p className="font-medium">Copia previa al reemplazo</p>
              <p className="break-all text-muted-foreground">
                {result.safetyBackup.filename}
              </p>
              {backupDirectory && (
                <p className="break-all text-muted-foreground">
                  {backupDirectory}
                </p>
              )}
            </div>
          ) : (
            <div className="min-w-0 space-y-4">
              <p className="break-all text-sm font-medium">{filename}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {preview &&
                  Object.entries(preview.counts).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground">
                        {countLabels[key as keyof typeof countLabels]}
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">
                        {value.toLocaleString("es-AR")}
                      </dd>
                    </div>
                  ))}
              </dl>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {importing && (
                <p role="status" className="text-sm text-muted-foreground">
                  Creando el backup e importando los datos. Esperá a que
                  termine.
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            {result ? (
              <Button type="button" onClick={() => window.location.reload()}>
                Continuar
              </Button>
            ) : (
              <>
                <AlertDialogCancel disabled={importing}>
                  Cancelar
                </AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={importing}
                  onClick={() => void importData()}
                >
                  {importing && (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  )}
                  {importing ? "Importando..." : "Importar y reemplazar"}
                </Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
