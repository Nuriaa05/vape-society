import { money, today } from "@/lib/collections-form";
import { useDeferredValue, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, StatusBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardToolbar, KpiCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CustomerForm,
  OpeningForm,
  AccreditationForm,
  RefundForm,
} from "@/components/collections-forms";
import {
  CollectionForm,
  type RecordedPayment,
} from "@/components/collection-payment-form";
import { CollectionPaymentResult } from "@/components/collection-payment-result";
import {
  Field,
  Modal,
  Pager,
  ReasonForm,
} from "@/components/collections-controls";
import { collectionsRepository as repo } from "@/lib/repositories/collections-repository";
import type {
  Customer,
  CardSettlementRow,
  RefundSourceRow,
} from "@/lib/collections";
import { Account, EntryList } from "@/components/collections-account";
import { CardScheduleForm } from "@/components/card-schedule-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type View = "Clientes" | "Tarjetas" | "Reintegros";
type Editing =
  | { kind: "customer"; customer?: Customer }
  | { kind: "account"; customer: Customer }
  | { kind: "opening"; customer: Customer }
  | { kind: "collect"; customer: Customer }
  | { kind: "paid"; customer: Customer; payment: RecordedPayment }
  | { kind: "accredit"; row: CardSettlementRow }
  | { kind: "schedule"; row: CardSettlementRow }
  | { kind: "refund"; row: RefundSourceRow }
  | {
      kind: "reason";
      title: string;
      description?: string;
      action: (reason: string) => Promise<unknown>;
    }
  | null;
const summaryLabels = {
  customerDebtAmountCents: "Deuda de clientes",
  overdueAmountCents: "Deuda vencida",
  cardPendingAmountCents: "Tarjetas pendientes (neto estimado)",
  cardUnscheduledAmountCents: "Tarjetas por completar (bruto)",
  collectedAmountCents: "Cobros registrados",
  refundedAmountCents: "Reintegros registrados",
};
export function ClientesCobranzasPage() {
  const [view, setView] = useState<View>("Clientes");
  const [customerSearch, setCustomerSearch] = useState("");
  const customerQuery = useDeferredValue(customerSearch);
  const [customerPage, setCustomerPage] = useState(0);
  const [q, setQ] = useState("");
  const search = useDeferredValue(q);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [inactive, setInactive] = useState(false);
  const [debtStatus, setDebtStatus] = useState<"" | "withDebt" | "overdue">("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [archivingCustomer, setArchivingCustomer] = useState<Customer | null>(
    null,
  );
  const movementsRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const client = useQueryClient();
  const filters = {
    q: search,
    month: month || undefined,
    status: status || undefined,
    customerId: customerId || undefined,
    take: 25,
    skip: page * 25,
  };
  const customers = useQuery({
    queryKey: [
      "collections",
      "customers",
      customerQuery,
      inactive,
      debtStatus,
      customerPage,
    ],
    queryFn: () =>
      repo.customers({
        q: customerQuery,
        includeInactive: inactive,
        debtStatus: debtStatus || undefined,
        take: 25,
        skip: customerPage * 25,
      }),
  });
  const customerOptions = useQuery({
    queryKey: ["collections", "customer-options"],
    queryFn: () => repo.customerOptions(),
  });
  const summary = useQuery({
    queryKey: ["collections", "summary", month, customerId],
    queryFn: () =>
      repo.summary({
        month: month || undefined,
        customerId: customerId || undefined,
      }),
  });
  const settlements = useQuery({
    queryKey: ["collections", "settlements", filters],
    queryFn: () => repo.settlements(filters),
    enabled: view === "Tarjetas",
  });
  const refunds = useQuery({
    queryKey: ["collections", "refunds", filters],
    queryFn: () => repo.refunds(filters),
    enabled: view === "Reintegros",
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: (result) => {
      setArchivingCustomer(null);
      void client.invalidateQueries({ queryKey: ["collections"] });
      void client.invalidateQueries({ queryKey: ["customers"] });
      if (editing?.kind === "customer") {
        void client.invalidateQueries({ queryKey: ["price-preview"] });
        void client.invalidateQueries({ queryKey: ["sale-price"] });
        void client.invalidateQueries({ queryKey: ["sale-quote"] });
      }
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void client.invalidateQueries({ queryKey: ["reports"] });
      void client.invalidateQueries({ queryKey: ["sales"] });
      if (editing?.kind === "collect") {
        setEditing({
          kind: "paid",
          customer: editing.customer,
          payment: result as RecordedPayment,
        });
        toast.success("Pago registrado");
      } else {
        const isOpening = editing?.kind === "opening";
        setEditing(
          isOpening ? { kind: "account", customer: editing.customer } : null,
        );
        toast.success(
          isOpening
            ? "Deuda anterior registrada"
            : archivingCustomer
              ? "Cliente archivado"
              : editing?.kind === "customer"
                ? "Cliente guardado"
                : "Movimiento guardado",
        );
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const submit = (action: () => Promise<unknown>) => mutation.mutate(action);
  const changeView = (next: View) => {
    setView(next);
    setPage(0);
    setStatus("");
    setQ("");
    if (next === "Clientes") setCustomerId("");
  };
  const query =
    view === "Clientes"
      ? customers
      : view === "Tarjetas"
        ? settlements
        : refunds;
  const isCustomers = view === "Clientes";
  const reason = (
    title: string,
    action: (reason: string) => Promise<unknown>,
    description?: string,
  ) => setEditing({ kind: "reason", title, action, description });
  return (
    <AppShell
      title="Clientes y cobranzas"
      subtitle="Consultá quién debe, registrá sus pagos y seguí el saldo pendiente"
      actions={
        <Button onClick={() => setEditing({ kind: "customer" })}>
          <Plus /> Nuevo cliente
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section aria-label="Resumen de cobranzas" className="space-y-4">
          <CardHeader
            title="Resumen de cobranzas"
            description={
              customerId
                ? `Cliente: ${customerOptions.data?.find((c) => c.id === customerId)?.name ?? "seleccionado"}`
                : "Todos los clientes"
            }
            className="gap-4 p-0"
            action={
              <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                <div className="min-w-44 flex-1 sm:flex-none">
                  <Field label="Mes">
                    <Input
                      type="month"
                      className="text-sm"
                      value={month}
                      onChange={(e) => {
                        setMonth(e.target.value);
                        setPage(0);
                      }}
                    />
                  </Field>
                </div>
                {month ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMonth("");
                      setPage(0);
                    }}
                  >
                    Todos los meses
                  </Button>
                ) : null}
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(summaryLabels)
              .filter(
                ([key]) =>
                  !isCustomers ||
                  [
                    "customerDebtAmountCents",
                    "overdueAmountCents",
                    "collectedAmountCents",
                  ].includes(key),
              )
              .map(([key, label]) => (
                <KpiCard
                  key={key}
                  label={
                    key === "collectedAmountCents" && month
                      ? "Cobros registrados del mes"
                      : label
                  }
                  value={
                    summary.data
                      ? money(
                          summary.data[key as keyof typeof summaryLabels] ?? 0,
                        )
                      : "—"
                  }
                  hint={
                    key === "overdueAmountCents"
                      ? "Incluida en la deuda de clientes"
                      : key === "collectedAmountCents" ||
                          key === "refundedAmountCents"
                        ? month
                          ? "Mes seleccionado"
                          : "Todos los meses"
                        : key === "cardUnscheduledAmountCents"
                          ? "Fecha o comisión por definir"
                          : "Todos los vencimientos"
                  }
                  className={cn(
                    isCustomers &&
                      key === "collectedAmountCents" &&
                      "sm:col-span-2 lg:col-span-1",
                    key === "overdueAmountCents" &&
                      (summary.data?.overdueAmountCents ?? 0) > 0 &&
                      "[&_.app-metric-value]:text-destructive",
                  )}
                />
              ))}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isCustomers
              ? "La deuda incluye todos los meses. El mes seleccionado solo filtra los cobros del resumen. Los filtros de abajo se aplican a la lista de clientes."
              : "El mes filtra cobros, reintegros y movimientos de tarjetas. Los saldos pendientes incluyen todos los vencimientos."}
          </p>
          {summary.error ? (
            <p
              role="alert"
              className="px-4 py-3 text-sm text-destructive sm:px-5"
            >
              No se pudieron cargar los totales.
            </p>
          ) : null}
        </section>
        <Card
          ref={movementsRef}
          role="region"
          aria-label={isCustomers ? "Clientes" : "Cobranzas"}
        >
          <CardHeader
            title={
              isCustomers
                ? "Clientes y cuotas"
                : view === "Tarjetas"
                  ? "Acreditaciones de tarjetas"
                  : "Reintegros"
            }
            description={
              isCustomers
                ? "Buscá al cliente y elegí Cobrar para registrar un pago o Ver cuenta para consultar su deuda."
                : "Consultá los detalles antes de registrar o revertir movimientos."
            }
          />
          <CardToolbar className="flex-col items-stretch gap-3 pt-0 lg:flex-row lg:items-center">
            <Select
              value={view}
              onValueChange={(value) => changeView(value as View)}
            >
              <SelectTrigger
                aria-label="Tipo de movimiento"
                className="lg:w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Clientes">Clientes y cuotas</SelectItem>
                <SelectItem value="Tarjetas">Tarjetas</SelectItem>
                <SelectItem value="Reintegros">Reintegros</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={
                  isCustomers ? "Buscar clientes" : "Buscar movimientos"
                }
                className="pl-9"
                value={isCustomers ? customerSearch : q}
                placeholder={
                  isCustomers ? "Nombre o celular" : "Cliente o referencia"
                }
                onChange={(e) => {
                  if (isCustomers) {
                    setCustomerSearch(e.target.value);
                    setCustomerPage(0);
                  } else {
                    setQ(e.target.value);
                    setPage(0);
                  }
                }}
              />
            </div>
            {isCustomers ? (
              <>
                <Select
                  value={debtStatus || "all"}
                  onValueChange={(value) => {
                    setDebtStatus(
                      value === "all" ? "" : (value as typeof debtStatus),
                    );
                    setCustomerPage(0);
                  }}
                >
                  <SelectTrigger
                    aria-label="Deuda del cliente"
                    className="lg:w-48"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    <SelectItem value="withDebt">Con deuda</SelectItem>
                    <SelectItem value="overdue">Con pagos vencidos</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 whitespace-nowrap px-2 text-sm text-muted-foreground">
                  <Switch
                    checked={inactive}
                    onCheckedChange={(checked) => {
                      setInactive(checked);
                      setCustomerPage(0);
                    }}
                  />
                  Incluir archivados
                </label>
              </>
            ) : (
              <>
                <Select
                  value={customerId || "all"}
                  onValueChange={(value) => {
                    setCustomerId(value === "all" ? "" : value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Cliente" className="lg:w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    {customerOptions.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? "" : " (archivado)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={status || "all"}
                  onValueChange={(value) => {
                    setStatus(value === "all" ? "" : value);
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Estado" className="lg:w-44">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {(view === "Tarjetas"
                      ? [
                          "Por completar",
                          "Pendiente",
                          "Parcial",
                          "Acreditada",
                          "Vencida",
                          "Anulada",
                        ]
                      : ["Pendiente", "Parcial", "Reintegrado"]
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </CardToolbar>
          {query.isPending ? (
            <p className="p-5">Cargando…</p>
          ) : query.error ? (
            <p className="p-5 text-destructive" role="alert">
              No se pudieron cargar los datos.{" "}
              <Button variant="outline" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </p>
          ) : query.data?.items.length === 0 ? (
            <p className="p-5 text-muted-foreground">
              No hay registros para estos filtros.
            </p>
          ) : (
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-foreground">
                  <tr>
                    {(isCustomers
                      ? [
                          "Cliente",
                          "Contacto",
                          "Deuda del cliente",
                          "Estado",
                          "Acciones",
                        ]
                      : view === "Tarjetas"
                        ? [
                            "Venta / procesador",
                            "Vencimiento",
                            "Bruto / comisión / neto",
                            "Pendiente",
                            "Acciones",
                          ]
                        : [
                            "Origen",
                            "Cliente",
                            "Reintegrado",
                            "Pendiente",
                            "Acciones",
                          ]
                    ).map((h) => (
                      <th
                        className={cn(
                          "app-table-heading font-medium",
                          ["Acciones", "Estado"].includes(h) && "text-center",
                          isCustomers && h === "Estado" && "w-44",
                          isCustomers && h === "Acciones" && "w-60",
                          [
                            "Deuda del cliente",
                            "Reintegrado",
                            "Pendiente",
                          ].includes(h) && "text-right",
                        )}
                        key={h}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isCustomers
                    ? customers.data?.items.map((c) => (
                        <tr
                          className={cn(
                            "border-b border-border/60 last:border-0 hover:bg-muted/30",
                            !c.active && "text-muted-foreground",
                          )}
                          key={c.id}
                        >
                          <Cell className="font-medium">
                            {c.name}
                            {!c.active ? (
                              <p className="text-xs text-muted-foreground">
                                Archivado
                              </p>
                            ) : null}
                          </Cell>
                          <Cell className="text-muted-foreground">
                            {c.phone || "—"}
                          </Cell>
                          <Cell className="text-right font-medium tabular-nums">
                            {money(c.balanceAmountCents ?? 0)}
                          </Cell>
                          <Cell className="text-center">
                            {(c.overdueAmountCents ?? 0) > 0 ? (
                              <StatusBadge tone="destructive">
                                Deuda vencida
                              </StatusBadge>
                            ) : (c.balanceAmountCents ?? 0) > 0 ? (
                              <StatusBadge tone="warning">Deuda</StatusBadge>
                            ) : (
                              <StatusBadge tone="success">Al día</StatusBadge>
                            )}
                          </Cell>
                          <Cell>
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <Button
                                size="sm"
                                disabled={
                                  mutation.isPending || !c.balanceAmountCents
                                }
                                onClick={(event) => {
                                  accountTriggerRef.current =
                                    event.currentTarget;
                                  setEditing({
                                    kind: "collect",
                                    customer: c,
                                  });
                                }}
                              >
                                Cobrar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={mutation.isPending}
                                aria-haspopup="dialog"
                                onClick={(event) => {
                                  accountTriggerRef.current =
                                    event.currentTarget;
                                  setEditing({ kind: "account", customer: c });
                                }}
                              >
                                Ver cuenta
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    aria-label={`Acciones de ${c.name}`}
                                    disabled={mutation.isPending}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setEditing({
                                        kind: "customer",
                                        customer: c,
                                      })
                                    }
                                  >
                                    <Pencil /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {c.active ? (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onSelect={() => setArchivingCustomer(c)}
                                    >
                                      <Archive /> Archivar
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        submit(() =>
                                          repo.archiveCustomer(c.id, true),
                                        )
                                      }
                                    >
                                      <ArchiveRestore /> Activar
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </Cell>
                        </tr>
                      ))
                    : null}
                  {view === "Tarjetas"
                    ? settlements.data?.items.map((r) => (
                        <tr
                          className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                          key={r.id}
                        >
                          <Cell>
                            {r.saleNumber} · {r.processor}
                            <br />
                            {r.reference}
                            <br />
                            {r.customerName || "Consumidor final"}
                          </Cell>
                          <Cell>{r.dueDate ?? "Por completar"}</Cell>
                          <Cell>
                            {money(r.grossAmountCents)}
                            {r.schedulePending ? (
                              <p className="text-xs text-muted-foreground">
                                Comisión y neto por completar
                              </p>
                            ) : (
                              <>
                                {" "}
                                / {money(r.feeAmountCents!)} /{" "}
                                {money(r.netAmountCents!)}
                              </>
                            )}
                          </Cell>
                          <Cell className="text-right tabular-nums">
                            {money(
                              r.remainingNetAmountCents ??
                                r.remainingGrossAmountCents,
                            )}
                            <br />
                            {r.status}
                          </Cell>
                          <Cell>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!r.remainingGrossAmountCents}
                                onClick={() =>
                                  setEditing({
                                    kind: r.schedulePending
                                      ? "schedule"
                                      : "accredit",
                                    row: r,
                                  })
                                }
                              >
                                {r.schedulePending
                                  ? "Completar acreditaciones"
                                  : "Acreditar"}
                              </Button>
                              {r.accreditations.map((a) => (
                                <div key={a.id} className="text-xs">
                                  {a.date} · Neto {money(a.netAmountCents)}{" "}
                                  {a.reversedAt ? (
                                    "(revertida)"
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        reason(
                                          "Revertir acreditación",
                                          (text) =>
                                            repo.reverseAccreditation(
                                              a.id,
                                              text,
                                            ),
                                        )
                                      }
                                    >
                                      Revertir
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </Cell>
                        </tr>
                      ))
                    : null}
                  {view === "Reintegros"
                    ? refunds.data?.items.map((r, i) => (
                        <tr
                          className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                          key={r.saleId ?? r.planId ?? i}
                        >
                          <Cell>{r.title}</Cell>
                          <Cell>{r.customerName || "Sin cliente"}</Cell>
                          <Cell className="text-right tabular-nums">
                            {money(r.refundedAmountCents)}
                          </Cell>
                          <Cell className="text-right font-medium tabular-nums">
                            {money(r.pendingAmountCents)}
                          </Cell>
                          <Cell>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!r.pendingAmountCents}
                                onClick={() =>
                                  setEditing(
                                    r.settlements?.some(
                                      (item) => item.schedulePending,
                                    )
                                      ? {
                                          kind: "schedule",
                                          row: r.settlements.find(
                                            (item) => item.schedulePending,
                                          )!,
                                        }
                                      : { kind: "refund", row: r },
                                  )
                                }
                              >
                                {r.settlements?.some(
                                  (item) => item.schedulePending,
                                )
                                  ? "Completar acreditaciones"
                                  : "Reintegrar"}
                              </Button>
                              <EntryList
                                entries={r.refunds}
                                refund
                                reverse={(id) =>
                                  reason("Revertir reintegro", (text) =>
                                    repo.reverseRefund(id, text),
                                  )
                                }
                              />
                            </div>
                          </Cell>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={isCustomers ? customerPage : page}
            total={query.data?.total ?? 0}
            change={isCustomers ? setCustomerPage : setPage}
          />
        </Card>
      </div>
      {editing ? (
        <Modal
          onCloseAutoFocus={(event) => {
            if (accountTriggerRef.current?.isConnected) {
              event.preventDefault();
              accountTriggerRef.current.focus();
            }
            accountTriggerRef.current = null;
          }}
          close={() => {
            if (!mutation.isPending) setEditing(null);
          }}
          title={
            editing.kind === "customer"
              ? editing.customer
                ? "Editar cliente"
                : "Nuevo cliente"
              : editing.kind === "account"
                ? `Cuenta de ${editing.customer.name}`
                : editing.kind === "collect"
                  ? `Cobrar a ${editing.customer.name}`
                  : editing.kind === "paid"
                    ? "Pago registrado"
                    : editing.kind === "opening"
                      ? "Cargar deuda anterior"
                      : editing.kind === "schedule"
                        ? "Completar acreditaciones esperadas"
                        : editing.kind === "accredit"
                          ? "Registrar acreditación"
                          : editing.kind === "refund"
                            ? "Registrar reintegro"
                            : editing.title
          }
        >
          {editing.kind === "account" ? (
            <Account
              customer={editing.customer}
              collect={() =>
                setEditing({ kind: "collect", customer: editing.customer })
              }
              cards={() => {
                accountTriggerRef.current = null;
                setEditing(null);
                setCustomerId(editing.customer.id);
                setMonth("");
                changeView("Tarjetas");
                movementsRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              opening={() =>
                setEditing({ kind: "opening", customer: editing.customer })
              }
              reverse={(id) =>
                reason("Revertir cobro", (text) =>
                  repo.reverseCollection(id, text),
                )
              }
              cancel={(id) =>
                reason(
                  "Anular deuda anterior",
                  (text) => repo.cancelPlan(editing.customer.id, id, text),
                  "Esto anula la deuda anterior y sus cuotas pendientes. No registra un pago. Si el cliente te entregó dinero, volvé a su cuenta y elegí Registrar cobro. Los pagos ya registrados se conservan; si corresponde devolver dinero, el reintegro se gestiona por separado.",
                )
              }
            />
          ) : editing.kind === "paid" ? (
            <CollectionPaymentResult
              customer={editing.customer}
              payment={editing.payment}
              account={() =>
                setEditing({ kind: "account", customer: editing.customer })
              }
              close={() => setEditing(null)}
            />
          ) : editing.kind === "customer" ? (
            <CustomerForm
              customer={editing.customer}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : editing.kind === "opening" ? (
            <OpeningForm
              customerId={editing.customer.id}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : editing.kind === "collect" ? (
            <CollectionForm
              customerId={editing.customer.id}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : editing.kind === "schedule" ? (
            <CardScheduleForm
              row={editing.row}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : editing.kind === "accredit" ? (
            <AccreditationForm
              row={editing.row}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : editing.kind === "refund" ? (
            <RefundForm
              row={editing.row}
              submit={submit}
              pending={mutation.isPending}
            />
          ) : (
            <ReasonForm
              pending={mutation.isPending}
              description={editing.description}
              submit={(text) => submit(() => editing.action(text))}
            />
          )}
        </Modal>
      ) : null}
      <AlertDialog
        open={Boolean(archivingCustomer)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setArchivingCustomer(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archivar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a archivar a {archivingCustomer?.name}. Dejará de aparecer en
              la lista habitual y en nuevas ventas. Su historial y su deuda se
              conservan; podés encontrarlo con Incluir archivados para cobrar o
              volver a activarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (archivingCustomer)
                  submit(() =>
                    repo.archiveCustomer(archivingCustomer.id, false),
                  );
              }}
            >
              {mutation.isPending ? "Archivando…" : "Archivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
function Cell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-5 py-3 align-middle", className)}>{children}</td>
  );
}
