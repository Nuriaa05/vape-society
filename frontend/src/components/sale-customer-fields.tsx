import { SaleCustomerCombobox } from "@/components/sale-customer-combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SaleCustomerFields({
  customerId,
  name,
  phone,
  required,
  onSelect,
  onDetailsChange,
}: {
  customerId: string;
  name: string;
  phone: string;
  required: boolean;
  onSelect: (id: string, name: string, phone: string) => void;
  onDetailsChange: (name: string, phone: string) => void;
}) {
  return (
    <section className="space-y-3" aria-labelledby="sale-customer-title">
      <div>
        <h3 id="sale-customer-title" className="text-sm font-medium">
          Cliente {required ? "· obligatorio" : "· opcional"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {required
            ? "Seleccioná o creá el cliente al que se le cobrarán las cuotas."
            : "Podés vender a consumidor final o vincular la compra a un cliente."}
        </p>
      </div>
      <SaleCustomerCombobox
        customerId={customerId}
        name={name}
        phone={phone}
        required={required}
        onSelect={onSelect}
      />
      {!customerId && !required ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sale-customer-name">Nombre del cliente</Label>
            <Input
              id="sale-customer-name"
              name="customerName"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(event) => onDetailsChange(event.target.value, phone)}
              placeholder="Opcional, para el comprobante"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-customer-phone">Celular del cliente</Label>
            <Input
              id="sale-customer-phone"
              name="customerPhone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              value={phone}
              onChange={(event) => onDetailsChange(name, event.target.value)}
              placeholder="Opcional"
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
