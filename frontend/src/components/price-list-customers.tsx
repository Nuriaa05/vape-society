import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Pager } from "./collections-controls";
import type { Customer } from "@/lib/collections";
import type { PriceList } from "@/lib/price-lists";
import { collectionsRepository } from "@/lib/repositories/collections-repository";
import { PriceListCustomerForm } from "./price-list-customer-form";

const customerQueryKey = ["customers", "price-list-assignment"] as const;

export function PriceListCustomers({
  list,
  lists,
}: {
  list: PriceList;
  lists: PriceList[];
}) {
  const client = useQueryClient();
  const customers = useQuery({
    queryKey: customerQueryKey,
    queryFn: () => collectionsRepository.customerOptions(),
  });
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const assignButtonRef = useRef<HTMLButtonElement | null>(null);
  const belongsToList = (customer: Customer) =>
    customer.priceListId === list.id ||
    (list.isGeneral && !customer.priceListId);
  const assigned = (customers.data ?? []).filter(belongsToList);
  const query = search.trim().toLocaleLowerCase();
  const available = (customers.data ?? []).filter(
    (customer) =>
      !belongsToList(customer) &&
      `${customer.name} ${customer.phone ?? ""}`
        .toLocaleLowerCase()
        .includes(query),
  );
  const listNames = new Map(lists.map((item) => [item.id, item.name]));

  function customerSaved(updated: Customer) {
    client.setQueryData<Customer[]>(customerQueryKey, (current = []) =>
      current.some((customer) => customer.id === updated.id)
        ? current.map((customer) =>
            customer.id === updated.id ? { ...customer, ...updated } : customer,
          )
        : [...current, updated],
    );
    for (const queryKey of [
      ["customers"],
      ["collections"],
      ["sale-price"],
      ["sale-quote"],
      ["history"],
    ]) {
      void client.invalidateQueries({ queryKey });
    }
    setOpen(false);
    setCreating(false);
  }

  const assignment = useMutation({
    mutationFn: ({
      customerId,
      priceListId,
    }: {
      customerId: string;
      priceListId: string | null;
    }) => collectionsRepository.assignPriceList(customerId, priceListId),
    onSuccess: (updated) => {
      customerSaved(updated);
      toast.success("Lista del cliente actualizada.");
    },
  });
  const creation = useMutation({
    mutationFn: (data: { name: string; phone?: string }) =>
      collectionsRepository.createCustomer({
        ...data,
        priceListId: list.isGeneral ? null : list.id,
      }),
    onSuccess: (created) => {
      customerSaved(created);
      toast.success(`Cliente creado y asignado a ${list.name}.`);
    },
  });
  const error = assignment.error?.message;
  const pending = assignment.isPending || creation.isPending;
  const busy = pending || customers.isFetching;

  return (
    <section
      aria-label="Clientes de esta lista"
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {list.isGeneral ? (
            <>
              Se aplica a todos los clientes sin lista particular (
              <strong>
                {customers.isPending
                  ? "…"
                  : customers.isError
                    ? "—"
                    : assigned.length}
              </strong>
              )
            </>
          ) : (
            <>
              Se aplica a{" "}
              <strong>
                {customers.isPending
                  ? "…"
                  : customers.isError
                    ? "—"
                    : assigned.length}{" "}
                {assigned.length === 1 ? "cliente" : "clientes"}
              </strong>
            </>
          )}
        </p>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <AssignedCustomersDialog
          list={list}
          customers={assigned}
          disabled={customers.isPending || customers.isError || busy}
          pending={pending}
          error={error}
          onOpen={() => assignment.reset()}
          remove={(customerId) =>
            assignment.mutate({ customerId, priceListId: null })
          }
        />
        {!list.isGeneral ? (
          <>
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
            <Button
              ref={assignButtonRef}
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              disabled={customers.isPending || customers.isError || busy}
              onClick={() => {
                assignment.reset();
                creation.reset();
                setCreating(false);
                setSearch("");
                setOpen(true);
              }}
            >
              Asignar cliente
            </Button>
          </>
        ) : null}
      </div>
      {customers.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">
            No se pudieron cargar los clientes de la lista.
          </p>
          <Button variant="outline" onClick={() => void customers.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            assignButtonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {creating ? "Nuevo cliente para" : "Asignar cliente a"}{" "}
              {list.name}
            </DialogTitle>
            <DialogDescription>
              {creating
                ? `Se creará el cliente con la lista ${list.name} para sus próximas ventas.`
                : "Elegí un cliente. La nueva lista se usará en sus próximas ventas; las compras anteriores conservarán sus precios."}
            </DialogDescription>
          </DialogHeader>
          {creating ? (
            <PriceListCustomerForm
              initialSearch={search.trim()}
              pending={creation.isPending}
              error={creation.error?.message}
              onSubmit={(data) => creation.mutate(data)}
              onBack={() => {
                creation.reset();
                setCreating(false);
              }}
            />
          ) : (
            <>
              <Field label="Buscar cliente por nombre o celular">
                <Input
                  autoFocus
                  value={search}
                  disabled={assignment.isPending}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                {available.slice(0, 25).map((customer) => (
                  <li
                    key={customer.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <CustomerIdentity customer={customer}>
                      <p className="text-sm text-muted-foreground">
                        Lista actual:{" "}
                        {customer.priceListId
                          ? (listNames.get(customer.priceListId) ??
                            "Lista asignada")
                          : "General"}
                      </p>
                    </CustomerIdentity>
                    <Button
                      size="sm"
                      disabled={busy}
                      aria-label={`Asignar a ${customer.name}`}
                      onClick={() =>
                        assignment.mutate({
                          customerId: customer.id,
                          priceListId: list.isGeneral ? null : list.id,
                        })
                      }
                    >
                      {assignment.isPending &&
                      assignment.variables?.customerId === customer.id
                        ? "Guardando..."
                        : "Asignar"}
                    </Button>
                  </li>
                ))}
              </ul>
              {!available.length ? (
                <p className="text-sm text-muted-foreground">
                  No se encontraron clientes para asignar.
                </p>
              ) : available.length > 25 ? (
                <p className="text-sm text-muted-foreground">
                  Mostrando 25 de {available.length} clientes. Refiná la
                  búsqueda para encontrar al cliente.
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  disabled={busy}
                  onClick={() => {
                    assignment.reset();
                    creation.reset();
                    setCreating(true);
                  }}
                >
                  Nuevo cliente
                </Button>
                <Button
                  variant="outline"
                  disabled={assignment.isPending}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AssignedCustomersDialog({
  list,
  customers,
  disabled,
  pending,
  error,
  onOpen,
  remove,
}: {
  list: PriceList;
  customers: Customer[];
  disabled: boolean;
  pending: boolean;
  error?: string;
  onOpen: () => void;
  remove: (customerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = search.trim().toLocaleLowerCase();
  const filtered = customers.filter((customer) =>
    `${customer.name} ${customer.phone ?? ""}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const currentPage = Math.min(
    page,
    Math.floor(Math.max(0, filtered.length - 1) / 25),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setSearch("");
          setPage(0);
          onOpen();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm"
          disabled={disabled}
        >
          Ver clientes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clientes de {list.name}</DialogTitle>
          <DialogDescription>
            {list.isGeneral
              ? "General se aplica automáticamente a los clientes sin una lista particular."
              : "Al quitar un cliente, pasará a usar General. Las ventas anteriores conservarán sus precios."}
          </DialogDescription>
        </DialogHeader>
        <Field label="Buscar cliente por nombre o celular">
          <Input
            value={search}
            disabled={pending}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {filtered
            .slice(currentPage * 25, (currentPage + 1) * 25)
            .map((customer) => (
              <li
                key={customer.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <CustomerIdentity customer={customer} />
                {!list.isGeneral ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    aria-label={`Quitar a ${customer.name} de ${list.name}`}
                    onClick={() => remove(customer.id)}
                  >
                    Quitar
                  </Button>
                ) : null}
              </li>
            ))}
        </ul>
        {!filtered.length ? (
          <p className="text-sm text-muted-foreground">
            {search.trim()
              ? "No se encontraron clientes."
              : "No hay clientes asignados a esta lista."}
          </p>
        ) : null}
        <Pager page={currentPage} total={filtered.length} change={setPage} />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerIdentity({
  customer,
  children,
}: {
  customer: Customer;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 break-words">
      <p className="font-medium">{customer.name}</p>
      <p className="text-sm text-muted-foreground">
        {customer.phone || "Sin celular"}
        {!customer.active ? " · Archivado" : ""}
      </p>
      {children}
    </div>
  );
}
