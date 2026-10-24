import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccountHistoryPager({
  kind,
  view,
  onPageChange,
}: {
  kind: "cobros" | "ventas";
  view: {
    start: number;
    end: number;
    total: number;
    page: number;
    pageCount: number;
  };
  onPageChange: (page: number) => void;
}) {
  const title = kind === "cobros" ? "Cobros" : "Ventas";
  const singular = kind === "cobros" ? "cobro" : "venta";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-xs text-muted-foreground">
        Mostrando{" "}
        {view.start === view.end ? view.start : `${view.start}–${view.end}`} de{" "}
        {view.total} {view.total === 1 ? singular : kind}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={`${title} anteriores`}
          disabled={view.page === 0}
          onClick={() => onPageChange(view.page - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          aria-label={`${title} siguientes`}
          disabled={view.page + 1 >= view.pageCount}
          onClick={() => onPageChange(view.page + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
