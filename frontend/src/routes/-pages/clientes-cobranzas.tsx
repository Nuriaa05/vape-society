import { money, today } from "@/lib/collections-form";
import { useDeferredValue, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CollectionForm,
  CustomerForm,
  OpeningForm,
  AccreditationForm,
  RefundForm,
} from "@/components/collections-forms";
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

type View = "Clientes" | "Tarjetas" | "Reintegros";
type Editing =
  | { kind: "customer"; customer?: Customer }
  | { kind: "account"; customer: Customer }
  | { kind: "opening"; customer: Customer }
  | { kind: "collect"; customer: Customer }
  | { kind: "accredit"; row: CardSettlementRow }
  | { kind: "schedule"; row: CardSettlementRow }
  | { kind: "refund"; row: RefundSourceRow }
  | {
      kind: "reason";
      title: string;
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
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
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
      customerPage,
    ],
    queryFn: () =>
      repo.customers({
        q: customerQuery,
        includeInactive: inactive,
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
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["collections"] });
      void client.invalidateQueries({ queryKey: ["customers"] });
      void client.invalidateQueries({ queryKey: ["history"] });
      void client.invalidateQueries({ queryKey: ["dashboard-summary"] });
      void client.invalidateQueries({ queryKey: ["reports"] });
      void client.invalidateQueries({ queryKey: ["sales"] });
      setEditing(null);
      toast.success("Movimiento guardado");
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
  ) => setEditing({ kind: "reason", title, action });
  return (
    <AppShell
      title="Clientes y cobranzas"
      subtitle="Cuentas, cuotas y movimientos de dinero"
      actions={
        <Button onClick={() => setEditing({ kind: "customer" })}>
          Nuevo cliente
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card className="app-card-body">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Resumen de cobranzas</h2>
              <p className="text-xs text-muted-foreground">
                {customerId
                  ? `Cliente: ${customerOptions.data?.find((c) => c.id === customerId)?.name ?? "seleccionado"}`
                  : "Todos los clientes"}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Mes">
                <Input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setPage(0);
                  }}
                />
              </Field>
              {month ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMonth("");
                    setPage(0);
                  }}
                >
                  Todos los meses
                </Button>
              ) : null}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
            {Object.entries(summaryLabels).map(([key, label]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-base font-semibold tabular-nums">
                  {summary.data
                    ? money(
                        summary.data[key as keyof typeof summaryLabels] ?? 0,
                      )
                    : "—"}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        {summary.error ? (
          <p role="alert" className="text-destructive">
            No se pudieron cargar los totales.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          El mes filtra cobros, reintegros y movimientos de tarjetas. Los saldos
          pendientes incluyen todos los vencimientos y no dependen de la página.
        </p>
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
                ? "Una fila por cliente. Abrí Cuenta para consultar sus cuotas e historial."
                : "Consultá los detalles antes de registrar o revertir movimientos."
            }
          />
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <Field label="Tipo de movimiento">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={view}
                onChange={(e) => changeView(e.target.value as View)}
              >
                <option value="Clientes">Clientes y cuotas</option>
                <option value="Tarjetas">Tarjetas</option>
                <option value="Reintegros">Reintegros</option>
              </select>
            </Field>
            <Field
              label={isCustomers ? "Buscar clientes" : "Buscar movimientos"}
            >
              <Input
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
            </Field>
            {isCustomers ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inactive}
                  onChange={(e) => {
                    setInactive(e.target.checked);
                    setCustomerPage(0);
                  }}
                />
                Incluir archivados
              </label>
            ) : (
              <>
                <Field label="Cliente">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todos los clientes</option>
                    {customerOptions.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.active ? "" : " (archivado)"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado">
                  <select
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="">Todos</option>
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
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {(isCustomers
                      ? [
                          "Cliente",
                          "Contacto",
                          "Deuda del cliente",
                          "Tarjetas por acreditar",
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
                      <th className="px-4 py-3 font-medium" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isCustomers
                    ? customers.data?.items.map((c) => (
                        <tr className="border-t border-border" key={c.id}>
                          <Cell>{c.name}</Cell>
                          <Cell>{c.phone || "—"}</Cell>
                          <Cell>{money(c.balanceAmountCents ?? 0)}</Cell>
                          <Cell>
                            <p>{money(c.cardPendingAmountCents ?? 0)}</p>
                            {(c.cardUnscheduledAmountCents ?? 0) > 0 ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {money(c.cardUnscheduledAmountCents ?? 0)} bruto
                                por completar
                              </p>
                            ) : null}
                          </Cell>
                          <Cell>{c.active ? "Activo" : "Archivado"}</Cell>
                          <Cell>
                            <Actions>
                              <Button
                                size="sm"
                                disabled={
                                  mutation.isPending || !c.balanceAmountCents
                                }
                                onClick={() =>
                                  setEditing({
                                    kind: "collect",
                                    customer: c,
                                  })
                                }
                              >
                                Cobrar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                aria-haspopup="dialog"
                                onClick={(event) => {
                                  accountTriggerRef.current =
                                    event.currentTarget;
                                  setEditing({ kind: "account", customer: c });
                                }}
                              >
                                Cuenta
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditing({
                                    kind: "customer",
                                    customer: c,
                                  })
                                }
                              >
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={mutation.isPending}
                                onClick={() =>
                                  submit(() =>
                                    repo.archiveCustomer(c.id, !c.active),
                                  )
                                }
                              >
                                {c.active ? "Archivar" : "Activar"}
                              </Button>
                            </Actions>
                          </Cell>
                        </tr>
                      ))
                    : null}
                  {view === "Tarjetas"
                    ? settlements.data?.items.map((r) => (
                        <tr className="border-t border-border" key={r.id}>
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
                          <Cell>
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
                          className="border-t border-border"
                          key={r.saleId ?? r.planId ?? i}
                        >
                          <Cell>{r.title}</Cell>
                          <Cell>{r.customerName || "Sin cliente"}</Cell>
                          <Cell>{money(r.refundedAmountCents)}</Cell>
                          <Cell>{money(r.pendingAmountCents)}</Cell>
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
                  : editing.kind === "opening"
                    ? "Registrar deuda inicial"
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
                reason("Anular deuda inicial", (text) =>
                  repo.cancelPlan(editing.customer.id, id, text),
                )
              }
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
              submit={(text) => submit(() => editing.action(text))}
            />
          )}
        </Modal>
      ) : null}
    </AppShell>
  );
}
function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
