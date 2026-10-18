import { SupplierAccountDialog } from "@/components/supplier-account";
import { supplierPayablesRepository } from "@/lib/repositories/supplier-payables-repository";
import { today } from "@/lib/collections-form";
import { Card, CardHeader, CardToolbar } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
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
import { type Supplier } from "@/lib/contracts";
import { suppliersRepository } from "@/lib/repositories";
import {
  canShowLess,
  canShowMore,
  getNextVisibleCount,
  getVisibleItems,
  PAGE_LIST_INCREMENT,
} from "@/lib/visible-items";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SupplierSummary } from "@/components/supplier-summary";
import { SupplierTable } from "@/components/supplier-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [search, setSearch] = useState("");
  const [debtFilter, setDebtFilter] = useState("all");
  const items = useMemo(
    () =>
      (suppliersQuery.data ?? []).filter((supplier) => {
        const matchesText =
          `${supplier.name} ${supplier.phone} ${supplier.email ?? ""}`
            .toLocaleLowerCase("es-AR")
            .includes(search.trim().toLocaleLowerCase("es-AR"));
        const balance = balances.get(supplier.id);
        const matchesDebt =
          debtFilter === "all" ||
          (!debtsQuery.isLoading &&
            !debtsQuery.error &&
            (debtFilter === "debt"
              ? (balance?.balance ?? 0) > 0
              : debtFilter === "overdue"
                ? (balance?.overdue ?? 0) > 0
                : (balance?.balance ?? 0) === 0));
        return matchesText && matchesDebt;
      }),
    [
      suppliersQuery.data,
      search,
      debtFilter,
      balances,
      debtsQuery.isLoading,
      debtsQuery.error,
    ],
  );
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
      <AppShell
        title="Proveedores"
        subtitle="Compras, deudas y pagos a tus proveedores"
      >
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando proveedores...
        </Card>
      </AppShell>
    );
  }

  if (suppliersQuery.error) {
    return (
      <AppShell
        title="Proveedores"
        subtitle="Compras, deudas y pagos a tus proveedores"
      >
        <Card className="app-card-body text-sm text-destructive">
          No se pudieron cargar los proveedores.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Proveedores"
      subtitle="Compras, deudas y pagos a tus proveedores"
      actions={
        <Button onClick={() => setEditing({ mode: "create" })}>
          <Plus /> Nuevo proveedor
        </Button>
      }
    >
      <SupplierSummary
        data={summaryQuery.data}
        loading={summaryQuery.isLoading}
        error={!!summaryQuery.error}
        month={summaryMonth}
        onMonth={(value) => setSummaryMonth(value || currentMonth)}
        retry={() => void summaryQuery.refetch()}
      />
      <Card className="overflow-hidden">
        <CardHeader title="Proveedores" />
        <CardToolbar className="flex flex-wrap gap-3 pt-0">
          <Input
            className="max-w-sm"
            aria-label="Buscar proveedor"
            placeholder="Buscar proveedor o contacto"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleSuppliersCount(PAGE_LIST_INCREMENT);
            }}
          />
          <Select
            value={debtFilter}
            onValueChange={(value) => {
              setDebtFilter(value);
              setVisibleSuppliersCount(PAGE_LIST_INCREMENT);
            }}
          >
            <SelectTrigger aria-label="Filtrar proveedores" className="sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              <SelectItem value="debt">Con deuda</SelectItem>
              <SelectItem value="overdue">Con deuda vencida</SelectItem>
              <SelectItem value="clear">Al día</SelectItem>
            </SelectContent>
          </Select>
        </CardToolbar>
        {debtsQuery.error ? (
          <p role="alert" className="px-5 py-3 text-sm text-destructive">
            No se pudieron consultar las deudas.{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void debtsQuery.refetch()}
            >
              Reintentar saldos
            </Button>
          </p>
        ) : null}
        <SupplierTable
          items={visibleSuppliers}
          balances={balances}
          loading={debtsQuery.isLoading}
          error={!!debtsQuery.error}
          pending={statusMutation.isPending}
          account={setAccountSupplier}
          edit={(supplier) => setEditing({ mode: "edit", supplier })}
          toggle={(supplier) => void toggleActive(supplier)}
        />
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
