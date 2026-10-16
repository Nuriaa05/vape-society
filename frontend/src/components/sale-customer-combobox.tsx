import { useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { collectionsRepository } from "@/lib/repositories/collections-repository";
import { cn } from "@/lib/utils";

export function SaleCustomerCombobox({
  customerId,
  name,
  phone,
  required,
  onSelect,
}: {
  customerId: string;
  name: string;
  phone: string;
  required: boolean;
  onSelect: (id: string, name: string, phone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const query = search.trim();
  const customers = useQuery({
    queryKey: ["customers", "sale", query],
    queryFn: () => collectionsRepository.findCustomers({ q: query, take: 30 }),
    enabled: open && !creating,
  });
  const items = customers.data?.items ?? [];
  const options = [
    ...(!query
      ? [
          {
            id: "",
            name: required ? "Sin cliente seleccionado" : "Consumidor final",
            phone: null,
          },
        ]
      : []),
    ...items,
  ];
  const exactMatch = items.some(
    (customer) =>
      customer.name.toLocaleLowerCase() === query.toLocaleLowerCase() ||
      (query && customer.phone?.trim() === query),
  );
  const canCreate =
    !customers.isPending &&
    !customers.isFetching &&
    !customers.isError &&
    (!query || !exactMatch);
  const create = useMutation({
    mutationFn: () =>
      collectionsRepository.createCustomer({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
      }),
    onSuccess: (customer) => {
      select(customer.id, customer.name, customer.phone ?? "");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      toast.success("Cliente creado y seleccionado.");
    },
  });

  function select(id: string, selectedName: string, selectedPhone: string) {
    onSelect(id, selectedName, selectedPhone);
    setOpen(false);
    setSearch("");
    setCreating(false);
  }

  function startCreating() {
    const searchingPhone = /^[+\d][\d\s()+.-]*$/.test(query);
    const initialName = query
      ? searchingPhone
        ? ""
        : query
      : customerId
        ? ""
        : name;
    const initialPhone = searchingPhone
      ? query
      : !query && !customerId
        ? phone
        : "";
    setNewName(initialName.slice(0, 100));
    setNewPhone(initialPhone.slice(0, 40));
    create.reset();
    setCreating(true);
  }

  function navigateOptions(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ),
    );
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="sale-customer">Buscar o crear cliente</Label>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (create.isPending) return;
          setOpen(nextOpen);
          if (!nextOpen) {
            setSearch("");
            setCreating(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            id="sale-customer"
            type="button"
            role="combobox"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-required={required}
            className="flex h-9 w-full min-w-0 items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className={cn("truncate", !customerId && "text-muted-foreground")}
            >
              {customerId
                ? `${name}${phone ? ` · ${phone}` : ""}`
                : required
                  ? "Seleccioná o buscá un cliente"
                  : "Consumidor final"}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          aria-label="Clientes de la venta"
          className="w-[calc(var(--radix-popover-trigger-width)/var(--interface-scale))] max-w-[calc(100vw-2rem)] p-0"
          align="start"
          sideOffset={4}
        >
          {creating ? (
            <form
              className="space-y-3 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (newName.trim() && !create.isPending) create.mutate();
              }}
            >
              <p className="text-sm font-medium">Nuevo cliente</p>
              <div className="space-y-1.5">
                <Label htmlFor="new-sale-customer-name">Nombre</Label>
                <Input
                  id="new-sale-customer-name"
                  autoFocus
                  required
                  maxLength={100}
                  value={newName}
                  disabled={create.isPending}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-sale-customer-phone">
                  Celular (opcional)
                </Label>
                <Input
                  id="new-sale-customer-phone"
                  type="tel"
                  maxLength={40}
                  value={newPhone}
                  disabled={create.isPending}
                  onChange={(event) => setNewPhone(event.target.value)}
                />
              </div>
              {create.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {create.error.message}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={create.isPending}
                  onClick={() => setCreating(false)}
                >
                  Volver
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newName.trim() || create.isPending}
                >
                  {create.isPending ? "Guardando..." : "Crear y seleccionar"}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center border-b border-border px-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  autoFocus
                  aria-label="Buscar por nombre o celular"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      listRef.current
                        ?.querySelector<HTMLButtonElement>('[role="option"]')
                        ?.focus();
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      if (customers.isFetching || customers.isError) return;
                      if (query && items.length === 1) {
                        const customer = items[0];
                        select(
                          customer.id,
                          customer.name,
                          customer.phone ?? "",
                        );
                      } else if (query && !items.length && canCreate)
                        startCreating();
                    }
                  }}
                  placeholder="Nombre o celular"
                  className="h-9 border-0 shadow-none focus-visible:ring-0"
                />
              </div>
              {customers.isFetching ? (
                <p
                  role="status"
                  className="px-3 py-2 text-sm text-muted-foreground"
                >
                  Buscando clientes...
                </p>
              ) : customers.isError ? (
                <p role="alert" className="px-3 py-2 text-sm text-destructive">
                  No se pudieron cargar los clientes.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void customers.refetch()}
                  >
                    Reintentar
                  </button>
                </p>
              ) : (
                <div
                  ref={listRef}
                  role="listbox"
                  aria-label="Clientes encontrados"
                  onKeyDown={navigateOptions}
                  className="max-h-60 overflow-y-auto py-1"
                >
                  {options.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      role="option"
                      aria-selected={customer.id === customerId}
                      onClick={() =>
                        select(
                          customer.id,
                          customer.id ? customer.name : "",
                          customer.phone ?? "",
                        )
                      }
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          customer.id !== customerId && "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{customer.name}</span>
                        {customer.phone ? (
                          <span className="block text-xs text-muted-foreground">
                            {customer.phone}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                  {!items.length ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {query
                        ? "No se encontró ningún cliente."
                        : "Todavía no hay clientes registrados."}
                    </p>
                  ) : null}
                  {customers.data?.hasMore ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">
                      Escribí el nombre o celular para ver más clientes.
                    </p>
                  ) : null}
                </div>
              )}
              {canCreate ? (
                <button
                  type="button"
                  onClick={startCreating}
                  className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {query ? `Crear cliente «${query}»` : "Nuevo cliente"}
                  </span>
                </button>
              ) : null}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
