import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { today } from "@/lib/collections-form";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const control = isValidElement<{ id?: string }>(children) ? children : null;
  const id = control?.props.id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control ? cloneElement(control, { id }) : children}
    </div>
  );
}
export function Amount({
  label,
  value,
  onChange,
  placeholder = "0,00",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <Input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Fecha del movimiento">
      <Input
        required
        type="date"
        max={today()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
export function Modal({
  title,
  children,
  close,
  onCloseAutoFocus,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-3xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Registro interno de clientes y movimientos. Los importes se expresan
            en pesos.
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Pager({
  page,
  total,
  change,
}: {
  page: number;
  total: number;
  change: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3">
      <span className="mr-auto w-full text-sm text-muted-foreground sm:mr-0 sm:w-auto">
        {total} registros · Página {page + 1}
      </span>
      <Button
        variant="outline"
        disabled={!page}
        onClick={() => change(page - 1)}
      >
        Anterior
      </Button>
      <Button
        variant="outline"
        disabled={(page + 1) * 25 >= total}
        onClick={() => change(page + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
}
export function ReasonForm({
  submit,
  pending,
  description,
}: {
  submit: (reason: string) => void;
  pending: boolean;
  description?: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit(reason.trim());
      }}
    >
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      <Field label="Motivo obligatorio">
        <Input
          required
          minLength={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <Button disabled={pending || reason.trim().length < 3}>Confirmar</Button>
    </form>
  );
}
