import { SupplierAccountDialog } from "@/components/supplier-account";
import { supplierPayablesRepository } from "@/lib/repositories/supplier-payables-repository";
import { money, today } from "@/lib/collections-form";
import { Card, CardHeader } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Supplier } from "@/lib/contracts";
import { suppliersRepository } from "@/lib/repositories";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import {
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type Editing =
  | { mode: "create" }
  | {
      mode: "edit";
      supplier: Supplier;
    }
  | null;

export function ProveedoresPage() {
  const queryClient = useQueryClient();
  const [accountSupplier, setAccountSupplier] = useState<Supplier | null>(null);
  const currentMonth = today().slice(0, 7);
  const [summaryMonth, setSummaryMonth] = useState(currentMonth);
  const debtsQuery = useQuery({
    queryKey: ["supplier-payables", "all"],
    queryFn: () => supplierPayablesRepository.all(),
  });
  const summaryQuery = useQuery({
    queryKey: ["supplier-payables", "summary", summaryMonth],
    queryFn: () =>
      supplierPayablesRepository.summary({ month: summaryMonth || undefined }),
  });
  const balances = useMemo(() => {
    const values = new Map<
      string,
      { balance: number; overdue: number; nextDueDate: string | null }
    >();
    for (const debt of debtsQuery.data ?? []) {
      const old = values.get(debt.supplierId) ?? {
        balance: 0,
        overdue: 0,
        nextDueDate: null,
      };
      values.set(debt.supplierId, {
        balance: old.balance + debt.balanceCents,
        overdue:
          old.overdue + (debt.status === "Vencida" ? debt.balanceCents : 0),
        nextDueDate:
          debt.balanceCents > 0 &&
          (!old.nextDueDate || debt.dueDate < old.nextDueDate)
            ? debt.dueDate
            : old.nextDueDate,
      });
    }
    return values;
  }, [debtsQuery.data]);
  const suppliersQuery = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersRepository.findAll(),
  });
  const saveSupplierMutation = useMutation({
    mutationFn: suppliersRepository.save,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      suppliersRepository.updateStatus(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const [editing, setEditing] = useState<Editing>(null);
  const [visibleSuppliersCount, setVisibleSuppliersCount] =
    useState(PAGE_LIST_INCREMENT);
  const items = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data]);
  const visibleSuppliers = useMemo(
    () => getVisibleItems(items, visibleSuppliersCount),
    [items, visibleSuppliersCount],
  );

  const save = async (s: Supplier) => {
    await saveSupplierMutation.mutateAsync(s);
    setEditing(null);
  };

  const toggleActive = async (s: Supplier) => {
    await statusMutation.mutateAsync({ id: s.id, active: !s.active });
  };

  if (suppliersQuery.isLoading) {
    return (
      <AppShell title="Proveedores" subtitle="Contactos y registros de compra">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando proveedores...
        </Card>
      </AppShell>
    );
  }

  if (suppliersQuery.error) {
    return (
      <AppShell title="Proveedores" subtitle="Contactos y registros de compra">
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar los proveedores.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Proveedores"
      subtitle="Contactos y registros de compra"
      actions={
        <Button onClick={() => setEditing({ mode: "create" })}>
          <Plus /> Nuevo proveedor
        </Button>
      }
    >
      <Card className="app-card-body space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Cuenta de proveedores</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="supplier-summary-month">Mes del resumen</Label>
            <Input
              id="supplier-summary-month"
              className="w-auto"
              type="month"
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value || currentMonth)}
            />
            {summaryMonth !== currentMonth ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSummaryMonth(currentMonth)}
              >
                Mes actual
              </Button>
            ) : null}
          </div>
        </div>
        {summaryQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando saldos...</p>
        ) : summaryQuery.error ? (
          <p className="text-sm text-destructive">
            No se pudieron cargar los saldos.
          </p>
        ) : summaryQuery.data ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {(
              [
                ["Deuda pendiente", summaryQuery.data.balanceCents],
                ["Vencida", summaryQuery.data.overdueCents],
                ["Vence en el mes", summaryQuery.data.dueThisMonthCents],
                ["Pagado en el mes", summaryQuery.data.paidAmountCents],
                [
                  "Reintegros por recibir",
                  summaryQuery.data.refundPendingCents,
                ],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-semibold tabular-nums">{money(amount)}</p>
              </div>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          La deuda y los reintegros incluyen todos los vencimientos. Los pagos
          corresponden a su fecha efectiva dentro del mes seleccionado.
        </p>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Proveedores" />
        <div
          className={
            visibleSuppliersCount > PAGE_LIST_INCREMENT
              ? "max-h-[640px] overflow-auto"
              : "overflow-x-auto"
          }
        >
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 z-10 text-left text-sm text-foreground border-b border-border bg-card">
              <tr>
                <th className="app-table-heading font-medium">Proveedor</th>
                <th className="app-table-heading font-medium">Contacto</th>
                <th className="app-table-heading font-medium">Última compra</th>
                <th className="app-table-heading font-medium">Estado</th>
                <th className="app-table-heading font-medium text-right">
                  Deuda pendiente
                </th>
                <th className="app-table-heading font-medium">
                  Próximo vencimiento
                </th>
                <th className="app-table-heading font-medium">Cuenta</th>
                <th className="app-table-heading font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleSuppliers.map((s) => {
                const isProtected = s.id === "local";
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-muted/30",
                      !s.active && "opacity-70",
                    )}
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{s.name}</div>
                      {s.notes && (
                        <div className="text-xs text-muted-foreground">
                          {s.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <div className="flex items-center gap-2 text-xs">
                        <Phone className="h-3 w-3" />
                        {s.phone}
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        <Mail className="h-3 w-3" />
                        {s.email || "Sin email"}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.lastPurchase}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={s.active ? "success" : "muted"}>
                        {s.active ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {debtsQuery.error ? (
                        <span className="text-destructive">Sin datos</span>
                      ) : debtsQuery.isLoading ? (
                        "..."
                      ) : (
                        <>
                          <div className="font-medium">
                            {money(balances.get(s.id)?.balance ?? 0)}
                          </div>
                          {(balances.get(s.id)?.overdue ?? 0) > 0 ? (
                            <div className="text-xs text-destructive">
                              Vencida: {money(balances.get(s.id)?.overdue ?? 0)}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {debtsQuery.error
                        ? "Sin datos"
                        : debtsQuery.isLoading
                          ? "..."
                          : (balances.get(s.id)?.nextDueDate ?? "—")}
                    </td>
                    <td className="px-5 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAccountSupplier(s)}
                      >
                        Cuenta
                      </Button>
                    </td>
                    <td className="px-2 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label="Acciones"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isProtected ? (
                            <DropdownMenuItem disabled>
                              <Power /> Proveedor fijo
                            </DropdownMenuItem>
                          ) : (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  setEditing({ mode: "edit", supplier: s })
                                }
                              >
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void toggleActive(s)}
                              >
                                {s.active ? (
                                  <>
                                    <PowerOff /> Desactivar
                                  </>
                                ) : (
                                  <>
                                    <Power /> Activar
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(canShowMore(visibleSuppliersCount, items.length) ||
          canShowLess(
            visibleSuppliersCount,
            PAGE_LIST_INCREMENT,
            items.length,
          )) && (
          <div className="border-t border-border px-5 py-3 flex justify-center gap-2">
            {canShowMore(visibleSuppliersCount, items.length) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVisibleSuppliersCount((current) =>
                    getNextVisibleCount(
                      current,
                      PAGE_LIST_INCREMENT,
                      items.length,
                    ),
                  )
                }
              >
                Ver m&aacute;s
              </Button>
            )}
            {canShowLess(
              visibleSuppliersCount,
              PAGE_LIST_INCREMENT,
              items.length,
            ) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVisibleSuppliersCount(PAGE_LIST_INCREMENT)}
              >
                Ver menos
              </Button>
            )}
          </div>
        )}
      </Card>

      {accountSupplier ? (
        <SupplierAccountDialog
          key={accountSupplier.id}
          supplier={accountSupplier}
          close={() => setAccountSupplier(null)}
        />
      ) : null}
      <SupplierDialog
        editing={editing}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </AppShell>
  );
}

function SupplierDialog({
  editing,
  onCancel,
  onSave,
}: {
  editing: Editing;
  onCancel: () => void;
  onSave: (s: Supplier) => Promise<void>;
}) {
  const isEdit = editing?.mode === "edit";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lastPurchase, setLastPurchase] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editing?.mode === "edit") {
      setName(editing.supplier.name);
      setPhone(editing.supplier.phone);
      setEmail(editing.supplier.email);
      setLastPurchase(
        editing.supplier.lastPurchase === "-"
          ? ""
          : editing.supplier.lastPurchase,
      );
      setNotes(editing.supplier.notes ?? "");
    } else if (editing?.mode === "create") {
      setName("");
      setPhone("");
      setEmail("");
      setLastPurchase("");
      setNotes("");
    }
  }, [editing]);

  if (!editing) return null;
  const canSave = name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    if (editing.mode === "edit") {
      void onSave({
        ...editing.supplier,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        lastPurchase,
        notes: notes.trim() || undefined,
      });
    } else {
      void onSave({
        id: "",
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim() || undefined,
        lastPurchase,
        active: true,
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar proveedor" : "Nuevo proveedor"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Actualizá datos de contacto o notas. No afecta las compras ya registradas."
              : "Cargá los datos del proveedor."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Razón social"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Teléfono</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+54 11 ..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Última compra
            </Label>
            <Input
              type="date"
              value={lastPurchase}
              onChange={(e) => setLastPurchase(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notas</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Días de entrega, condiciones de pago…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSave}>
            {isEdit ? "Guardar cambios" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
