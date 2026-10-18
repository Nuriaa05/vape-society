import { Disclosure } from "@/components/ui/disclosure";
import {
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Power,
  PowerOff,
} from "lucide-react";
import { StatusBadge } from "./app-shell";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { money } from "@/lib/collections-form";
import { formatDateAR } from "@/lib/formatters";
import type { Supplier } from "@/lib/contracts";

export type SupplierBalance = {
  balance: number;
  overdue: number;
  nextDueDate: string | null;
};
export function SupplierTable({
  items,
  balances,
  loading,
  error,
  pending,
  account,
  edit,
  toggle,
}: {
  items: Supplier[];
  balances: Map<string, SupplierBalance>;
  loading: boolean;
  error: boolean;
  pending: boolean;
  account: (supplier: Supplier) => void;
  edit: (supplier: Supplier) => void;
  toggle: (supplier: Supplier) => void;
}) {
  return (
    <div className="max-h-[640px] overflow-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-card">
          <tr>
            <th className="app-table-heading text-left font-medium">
              Proveedor
            </th>
            <th className="app-table-heading text-right font-medium">
              Deuda pendiente
            </th>
            <th className="app-table-heading text-center font-medium">
              Estado
            </th>
            <th className="app-table-heading text-center font-medium">
              Próximo vencimiento
            </th>
            <th className="app-table-heading text-center font-medium">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((supplier) => {
            const balance = balances.get(supplier.id);
            return (
              <tr
                key={supplier.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="px-5 py-3">
                  <div className="font-medium">
                    {supplier.name}
                    {!supplier.active ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  <Disclosure
                    className="mt-2 min-w-44"
                    title="Datos de contacto"
                  >
                    <div className="mt-2 space-y-1">
                      <p className="flex items-center gap-2">
                        <Phone className="size-3" />
                        {supplier.phone || "Sin teléfono"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Mail className="size-3" />
                        {supplier.email || "Sin email"}
                      </p>
                      <p>Última compra: {supplier.lastPurchase}</p>
                      {supplier.notes ? <p>{supplier.notes}</p> : null}
                    </div>
                  </Disclosure>
                </td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">
                  {error
                    ? "Sin datos"
                    : loading
                      ? "..."
                      : money(balance?.balance ?? 0)}
                </td>
                <td className="px-5 py-3 text-center">
                  {error || loading ? (
                    "—"
                  ) : (
                    <StatusBadge
                      tone={
                        (balance?.overdue ?? 0) > 0
                          ? "destructive"
                          : (balance?.balance ?? 0) > 0
                            ? "warning"
                            : "success"
                      }
                    >
                      {(balance?.overdue ?? 0) > 0
                        ? "Deuda vencida"
                        : (balance?.balance ?? 0) > 0
                          ? "Deuda"
                          : "Al día"}
                    </StatusBadge>
                  )}
                </td>
                <td className="px-5 py-3 text-center text-muted-foreground">
                  {error || loading
                    ? "—"
                    : balance?.nextDueDate
                      ? formatDateAR(`${balance.nextDueDate}T12:00:00`)
                      : "—"}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => account(supplier)}
                    >
                      Ver cuenta
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Acciones de ${supplier.name}`}
                          disabled={pending}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {supplier.id === "local" ? (
                          <DropdownMenuItem disabled>
                            <Power />
                            Proveedor fijo
                          </DropdownMenuItem>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => edit(supplier)}>
                              <Pencil />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggle(supplier)}>
                              {supplier.active ? <PowerOff /> : <Power />}
                              {supplier.active ? "Desactivar" : "Activar"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </td>
              </tr>
            );
          })}
          {!items.length ? (
            <tr>
              <td
                colSpan={5}
                className="px-5 py-8 text-center text-muted-foreground"
              >
                No hay proveedores que coincidan con los filtros.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
