import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { Field } from "./collections-controls";

export function PriceListCustomerForm({
  initialSearch,
  pending,
  error,
  onSubmit,
  onBack,
}: {
  initialSearch: string;
  pending: boolean;
  error?: string;
  onSubmit: (data: { name: string; phone?: string }) => void;
  onBack: () => void;
}) {
  const searchingPhone = /^[+\d][\d\s()+.-]*$/.test(initialSearch);
  const [name, setName] = useState(
    searchingPhone ? "" : initialSearch.slice(0, 100),
  );
  const [phone, setPhone] = useState(
    searchingPhone ? initialSearch.slice(0, 40) : "",
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !name.trim()) return;
        onSubmit({ name: name.trim(), phone: phone.trim() || undefined });
      }}
    >
      <Field label="Nombre">
        <Input
          autoFocus
          autoComplete="name"
          required
          maxLength={100}
          disabled={pending}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Celular (opcional)">
        <Input
          type="tel"
          autoComplete="tel"
          maxLength={40}
          disabled={pending}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onBack}
        >
          Volver a clientes
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Guardando..." : "Crear y asignar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
