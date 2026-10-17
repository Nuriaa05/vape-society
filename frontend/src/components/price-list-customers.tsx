import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  const [page, setPage] = useState(0);
  const belongsToList = (customer: Customer) =>
    customer.priceListId === list.id ||
    (list.isGeneral && !customer.priceListId);
  const assigned = (customers.data ?? []).filter(belongsToList);
  const currentPage = Math.min(
    page,
    Math.floor(Math.max(0, assigned.length - 1) / 25),
  );
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
    setPage(0);
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
      className="flex min-w-0 flex-col gap-4 pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Clientes de esta lista</h3>
          <p className="text-sm text-muted-foreground">
            {list.isGeneral
              ? "Los clientes sin una lista particular usan General."
              : "Esta lista se aplicará automáticamente en sus próximas ventas."}
          </p>
        </div>
        <Button
          variant="outline"
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
      ) : customers.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando clientes...
        </p>
      ) : assigned.length ? (
        <>
          <ul className="divide-y divide-border">
            {assigned
              .slice(currentPage * 25, (currentPage + 1) * 25)
              .map((customer) => (
                <li
                  key={customer.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <CustomerIdentity customer={customer} />
                  {!list.isGeneral ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      aria-label={`Usar General para ${customer.name}`}
                      onClick={() =>
                        assignment.mutate({
                          customerId: customer.id,
                          priceListId: null,
                        })
                      }
                    >
                      Usar General
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
          <Pager page={currentPage} total={assigned.length} change={setPage} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay clientes asignados a esta lista.
        </p>
      )}
      {!open && error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
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
