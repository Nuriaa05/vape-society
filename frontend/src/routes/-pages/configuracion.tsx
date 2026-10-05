import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  Database,
  Info,
  LoaderCircle,
  Monitor,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type CategorySetting,
  type CouponDiscountType,
  type CouponSetting,
  type LocalSettings,
  type PaymentMethodSetting,
} from "@/lib/contracts";
import {
  backupsRepository,
  couponsRepository,
  productsRepository,
  salesRepository,
  settingsRepository,
} from "@/lib/repositories";
import { toast } from "sonner";
import { TZ } from "@/lib/formatters";
import { formatAmountCentsAsARS } from "@/lib/money";
import { getMutationErrorMessage } from "@/lib/mutation-errors";
import {
  basisPointsToPercentInput,
  percentInputToBasisPoints,
} from "@/lib/payment-pricing";
import {
  canDeleteCategory,
  canDeleteCoupon,
  canDeletePaymentMethod,
} from "@/lib/settings-delete-rules";
import {
  getSettingsSaveErrorMessage,
  getSettingsSaveSuccessMessage,
  type SettingsSaveSection,
} from "@/lib/settings-save-feedback";
import {
  getPrinterSelectionValue,
  SYSTEM_DIALOG_SELECTION,
  toPrinterSettingsPayload,
} from "@/lib/desktop-printer";
import type { PaymentMethodUpdateInput } from "@/lib/repositories/settings-repository";

type Cat = CategorySetting;
type Pay = PaymentMethodSetting;

type CouponFormState = {
  id: string | null;
  code: string;
  discountType: CouponDiscountType;
  valueInput: string;
  enabled: boolean;
};

const EMPTY_COUPON_FORM: CouponFormState = {
  id: null,
  code: "",
  discountType: "Percentage",
  valueInput: "",
  enabled: true,
};

function couponToForm(coupon: CouponSetting): CouponFormState {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    valueInput:
      coupon.discountType === "Percentage"
        ? basisPointsToPercentInput(coupon.discountBasisPoints ?? 0)
        : String(coupon.discountAmount ?? "").replace(".", ","),
    enabled: coupon.enabled,
  };
}

function getCouponDiscountLabel(coupon: CouponSetting): string {
  if (coupon.discountType === "Percentage") {
    return `${basisPointsToPercentInput(coupon.discountBasisPoints ?? 0)}%`;
  }

  return formatAmountCentsAsARS(Math.round((coupon.discountAmount ?? 0) * 100));
}

const EMPTY_SETTINGS: LocalSettings = {
  business: {
    name: "",
    address: "",
    cuit: "",
    phone: "",
  },
  receipt: {
    header: "",
    footer: "",
  },
  defaultMargin: 0,
  comboTicketMode: "ComboLine",
  categories: [],
  paymentMethods: [],
};

function formatBackupDate(createdAt?: string): string {
  if (!createdAt) return "Sin backups";

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: TZ,
  }).format(new Date(createdAt));
}

function formatBackupSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ConfigPage() {
  const queryClient = useQueryClient();
  const printerBridge =
    typeof window === "undefined" ? undefined : window.retailCore?.printer;
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsRepository.getSettings(),
  });
  const printersQuery = useQuery({
    queryKey: ["desktop-printers"],
    queryFn: () => printerBridge?.listPrinters() ?? Promise.resolve([]),
    enabled: Boolean(printerBridge),
  });
  const printerSettingsQuery = useQuery({
    queryKey: ["desktop-printer-settings"],
    queryFn: () =>
      printerBridge?.getSettings() ??
      Promise.resolve({
        mode: "system-dialog" as const,
        deviceName: null,
        paperWidthMm: 58 as const,
      }),
    enabled: Boolean(printerBridge),
  });
  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: () => backupsRepository.findAll(),
  });
  const productsQuery = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => productsRepository.findAll(),
  });
  const salesQuery = useQuery({
    queryKey: ["sales"],
    queryFn: () => salesRepository.findAll(),
  });
  const couponsQuery = useQuery({
    queryKey: ["coupons"],
    queryFn: () => couponsRepository.findAll(),
  });
  const invalidateSettings = () => {
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
  };
  const invalidateCatalogSettings = () => {
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };
  const invalidateCouponData = () => {
    void queryClient.invalidateQueries({ queryKey: ["coupons"] });
    void queryClient.invalidateQueries({ queryKey: ["settings"] });
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
  };
  const updateBusinessMutation = useMutation({
    mutationFn: settingsRepository.updateBusiness,
    onSuccess: invalidateSettings,
  });
  const updateReceiptMutation = useMutation({
    mutationFn: settingsRepository.updateReceipt,
    onSuccess: invalidateSettings,
  });
  const updateDefaultMarginMutation = useMutation({
    mutationFn: (value: number) =>
      settingsRepository.updateDefaultMargin(value),
    onSuccess: invalidateSettings,
  });
  const updateComboTicketModeMutation = useMutation({
    mutationFn: (
      comboTicketMode: NonNullable<LocalSettings["comboTicketMode"]>,
    ) => settingsRepository.updateComboTicketMode(comboTicketMode),
    onSuccess: invalidateSettings,
  });
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => settingsRepository.createCategory(name),
    onSuccess: invalidateCatalogSettings,
  });
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => settingsRepository.deleteCategory(id),
    onSuccess: invalidateCatalogSettings,
  });
  const createPaymentMethodMutation = useMutation({
    mutationFn: (name: string) => settingsRepository.createPaymentMethod(name),
    onSuccess: invalidateSettings,
  });
  const deletePaymentMethodMutation = useMutation({
    mutationFn: (id: string) => settingsRepository.deletePaymentMethod(id),
    onSuccess: invalidateSettings,
  });
  const updatePaymentMethodMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: PaymentMethodUpdateInput;
    }) => settingsRepository.updatePaymentMethod(id, input),
    onSuccess: invalidateSettings,
  });
  const createCouponMutation = useMutation({
    mutationFn: couponsRepository.create,
    onSuccess: invalidateCouponData,
  });
  const updateCouponMutation = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof couponsRepository.update>[1];
    }) => couponsRepository.update(id, input),
    onSuccess: invalidateCouponData,
  });
  const deleteCouponMutation = useMutation({
    mutationFn: (id: string) => couponsRepository.delete(id),
    onSuccess: invalidateCouponData,
  });
  const createBackupMutation = useMutation({
    mutationFn: () => backupsRepository.create(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });
  const savePrinterMutation = useMutation({
    mutationFn: (selection: string) =>
      printerBridge?.saveSettings(toPrinterSettingsPayload(selection)) ??
      Promise.reject(new Error("Impresión desktop no disponible.")),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["desktop-printer-settings"],
      });
    },
  });
  const settings = settingsQuery.data ?? EMPTY_SETTINGS;
  const [biz, setBiz] = useState(settings.business);
  const [ticket, setTicket] = useState(settings.receipt);
  const [comboTicketMode, setComboTicketMode] = useState<
    NonNullable<LocalSettings["comboTicketMode"]>
  >(settings.comboTicketMode ?? "ComboLine");
  const [defaultMargin, setDefaultMargin] = useState<number>(
    settings.defaultMargin,
  );

  const [cats, setCats] = useState<Cat[]>(settings.categories);
  const [newCat, setNewCat] = useState("");

  const [pays, setPays] = useState<Pay[]>(settings.paymentMethods);
  const [newPay, setNewPay] = useState("");
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const [paymentPercentInputs, setPaymentPercentInputs] = useState<
    Record<string, string>
  >({});
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [couponForm, setCouponForm] =
    useState<CouponFormState>(EMPTY_COUPON_FORM);
  const [couponToDelete, setCouponToDelete] = useState<CouponSetting | null>(
    null,
  );
  const [selectedPrinterValue, setSelectedPrinterValue] = useState(
    SYSTEM_DIALOG_SELECTION,
  );
  const products = productsQuery.data ?? [];
  const sales = salesQuery.data ?? [];
  const coupons = couponsQuery.data ?? [];

  useEffect(() => {
    if (!settingsQuery.data) return;
    setBiz(settingsQuery.data.business);
    setTicket(settingsQuery.data.receipt);
    setComboTicketMode(settingsQuery.data.comboTicketMode ?? "ComboLine");
    setDefaultMargin(settingsQuery.data.defaultMargin);
    setCats(settingsQuery.data.categories);
    setPays(settingsQuery.data.paymentMethods);
    setPaymentPercentInputs(
      Object.fromEntries(
        settingsQuery.data.paymentMethods.map((method) => [
          method.id,
          basisPointsToPercentInput(method.surchargeBasisPoints),
        ]),
      ),
    );
  }, [settingsQuery.data]);

  useEffect(() => {
    if (printerSettingsQuery.data) {
      setSelectedPrinterValue(
        getPrinterSelectionValue(
          printerSettingsQuery.data,
          printersQuery.data ?? [],
        ),
      );
    }
  }, [printerSettingsQuery.data, printersQuery.data]);

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    const category = await createCategoryMutation.mutateAsync(name);
    setCats((arr) => [...arr, category]);
    setNewCat("");
  };

  const deleteCategory = async (category: Cat) => {
    if (!canDeleteCategory(category, products)) {
      toast.error(
        "No se puede eliminar la categoría porque tiene productos asociados.",
      );
      return;
    }

    try {
      await deleteCategoryMutation.mutateAsync(category.id);
      setCats((arr) => arr.filter((item) => item.id !== category.id));
      toast.success("Categoría eliminada.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo eliminar la categoría."),
      );
    }
  };

  const addPaymentMethod = async () => {
    const name = newPay.trim();
    if (!name) return;
    try {
      const method = await createPaymentMethodMutation.mutateAsync(name);
      setPays((arr) => [...arr, method]);
      setPaymentPercentInputs((current) => ({
        ...current,
        [method.id]: basisPointsToPercentInput(method.surchargeBasisPoints),
      }));
      setNewPay("");
      toast.success("Método de pago agregado.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo agregar el método de pago."),
      );
    }
  };

  const deletePaymentMethod = async (method: Pay) => {
    if (!canDeletePaymentMethod(method, sales)) {
      toast.error(
        "No se puede eliminar el método de pago porque tiene ventas asociadas.",
      );
      return;
    }

    try {
      await deletePaymentMethodMutation.mutateAsync(method.id);
      setPays((arr) => arr.filter((item) => item.id !== method.id));
      toast.success("Método de pago eliminado.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(
          error,
          "No se pudo eliminar el método de pago.",
        ),
      );
    }
  };

  const savePaymentMethod = async (method: Pay) => {
    const name = method.name.trim();
    const persisted =
      settings.paymentMethods.find((item) => item.id === method.id) ?? method;

    if (!name) {
      setPays((current) =>
        current.map((item) => (item.id === method.id ? persisted : item)),
      );
      toast.error("El nombre del método de pago es obligatorio.");
      return;
    }

    if (name === persisted.name) return;
    await persistPaymentMethod(method.id, { name }, persisted);
  };

  const togglePaymentMethod = async (method: Pay) => {
    const persisted =
      settings.paymentMethods.find((item) => item.id === method.id) ?? method;
    await persistPaymentMethod(
      method.id,
      { enabled: !persisted.enabled },
      persisted,
    );
  };

  const persistPaymentMethod = async (
    id: string,
    input: PaymentMethodUpdateInput,
    persisted: Pay,
  ) => {
    try {
      const saved = await updatePaymentMethodMutation.mutateAsync({
        id,
        input,
      });
      setPays((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setPaymentPercentInputs((current) => ({
        ...current,
        [saved.id]: basisPointsToPercentInput(saved.surchargeBasisPoints),
      }));
    } catch (error) {
      setPays((current) =>
        current.map((item) => (item.id === id ? persisted : item)),
      );
      setPaymentPercentInputs((current) => ({
        ...current,
        [id]: basisPointsToPercentInput(persisted.surchargeBasisPoints),
      }));
      toast.error(
        getMutationErrorMessage(error, "No se pudo guardar el método de pago."),
      );
    }
  };

  const savePaymentSurcharge = async (method: Pay, input: string) => {
    const persisted =
      settings.paymentMethods.find((item) => item.id === method.id) ?? method;

    try {
      const surchargeBasisPoints = percentInputToBasisPoints(input);
      if (surchargeBasisPoints === persisted.surchargeBasisPoints) {
        setPaymentPercentInputs((current) => ({
          ...current,
          [method.id]: basisPointsToPercentInput(surchargeBasisPoints),
        }));
        return;
      }
      await persistPaymentMethod(
        method.id,
        { surchargeBasisPoints },
        persisted,
      );
    } catch (error) {
      setPaymentPercentInputs((current) => ({
        ...current,
        [method.id]: basisPointsToPercentInput(persisted.surchargeBasisPoints),
      }));
      toast.error(getMutationErrorMessage(error, "Ingresá un recargo válido."));
    }
  };

  const toggleCashHandling = async (method: Pay) => {
    const persisted =
      settings.paymentMethods.find((item) => item.id === method.id) ?? method;
    await persistPaymentMethod(
      method.id,
      { cashHandling: !persisted.cashHandling },
      persisted,
    );
  };

  const openNewCoupon = () => {
    setCouponForm(EMPTY_COUPON_FORM);
    setCouponDialogOpen(true);
  };

  const openEditCoupon = (coupon: CouponSetting) => {
    setCouponForm(couponToForm(coupon));
    setCouponDialogOpen(true);
  };

  const closeCouponDialog = () => {
    if (createCouponMutation.isPending || updateCouponMutation.isPending)
      return;
    setCouponDialogOpen(false);
    setCouponForm(EMPTY_COUPON_FORM);
  };

  const saveCoupon = async () => {
    const code = couponForm.code.trim();
    if (!code) {
      toast.error("El código del cupón es obligatorio.");
      return;
    }

    try {
      let discountBasisPoints: number | null = null;
      let discountAmount: string | null = null;

      if (couponForm.discountType === "Percentage") {
        discountBasisPoints = percentInputToBasisPoints(couponForm.valueInput);
        if (discountBasisPoints === 0) {
          throw new Error("El descuento debe ser mayor a 0%.");
        }
      } else {
        if (!couponForm.valueInput.trim()) {
          throw new Error("El importe del descuento es obligatorio.");
        }
        discountAmount = couponForm.valueInput;
      }

      const input = {
        code,
        discountType: couponForm.discountType,
        discountBasisPoints,
        discountAmount,
        enabled: couponForm.enabled,
      };

      if (couponForm.id) {
        await updateCouponMutation.mutateAsync({
          id: couponForm.id,
          input,
        });
        toast.success("Cupón actualizado.");
      } else {
        await createCouponMutation.mutateAsync(input);
        toast.success("Cupón creado.");
      }

      setCouponDialogOpen(false);
      setCouponForm(EMPTY_COUPON_FORM);
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo guardar el cupón."),
      );
    }
  };

  const toggleCoupon = async (coupon: CouponSetting) => {
    try {
      await updateCouponMutation.mutateAsync({
        id: coupon.id,
        input: { enabled: !coupon.enabled },
      });
      toast.success(coupon.enabled ? "Cupón desactivado." : "Cupón activado.");
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo actualizar el cupón."),
      );
    }
  };

  const deleteCoupon = async () => {
    if (!couponToDelete) return;
    if (!canDeleteCoupon(couponToDelete, sales)) {
      toast.error(
        "No se puede eliminar el cupón porque tiene ventas asociadas.",
      );
      setCouponToDelete(null);
      return;
    }

    try {
      await deleteCouponMutation.mutateAsync(couponToDelete.id);
      toast.success("Cupón eliminado.");
      setCouponToDelete(null);
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, "No se pudo eliminar el cupón."),
      );
    }
  };
  const saveSettingsSection = async (
    section: SettingsSaveSection,
    save: () => Promise<unknown>,
  ) => {
    try {
      await save();
      toast.success(getSettingsSaveSuccessMessage(section));
    } catch (error) {
      toast.error(
        getMutationErrorMessage(error, getSettingsSaveErrorMessage(section)),
      );
    }
  };

  const latestBackup = backupsQuery.data?.[0];

  if (settingsQuery.isLoading) {
    return (
      <AppShell title="Configuración" subtitle="Datos del local y catálogos">
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
          Cargando configuración...
        </div>
      </AppShell>
    );
  }

  if (settingsQuery.error) {
    return (
      <AppShell title="Configuración" subtitle="Datos del local y catálogos">
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
          No se pudo cargar la configuración.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configuración" subtitle="Datos del local y catálogos">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Datos del local"
          actions={
            <Button
              size="sm"
              onClick={() =>
                void saveSettingsSection("business", () =>
                  updateBusinessMutation.mutateAsync(biz),
                )
              }
              disabled={updateBusinessMutation.isPending}
            >
              <Save /> Guardar
            </Button>
          }
        >
          <Field label="Nombre del local">
            <Input
              value={biz.name}
              onChange={(e) => setBiz({ ...biz, name: e.target.value })}
            />
          </Field>
          <Field label="Dirección">
            <Input
              value={biz.address}
              onChange={(e) => setBiz({ ...biz, address: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CUIT">
              <Input
                value={biz.cuit}
                onChange={(e) => setBiz({ ...biz, cuit: e.target.value })}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={biz.phone}
                onChange={(e) => setBiz({ ...biz, phone: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card
          title="Comprobante interno"
          actions={
            <Button
              size="sm"
              onClick={() =>
                void saveSettingsSection("receipt", () =>
                  updateReceiptMutation.mutateAsync(ticket),
                )
              }
              disabled={updateReceiptMutation.isPending}
            >
              <Save /> Guardar
            </Button>
          }
        >
          <Field label="Encabezado del ticket">
            <Input
              value={ticket.header}
              onChange={(e) => setTicket({ ...ticket, header: e.target.value })}
            />
          </Field>
          <Field label="Pie del ticket">
            <Textarea
              rows={2}
              value={ticket.footer}
              onChange={(e) => setTicket({ ...ticket, footer: e.target.value })}
            />
          </Field>
          <Field label="Combos en el ticket">
            <div className="flex items-center gap-2">
              <Select
                value={comboTicketMode}
                onValueChange={(value) =>
                  setComboTicketMode(
                    value as NonNullable<LocalSettings["comboTicketMode"]>,
                  )
                }
              >
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ComboLine">Una linea de combo</SelectItem>
                  <SelectItem value="ComboWithComponents">
                    Combo + componentes sin precios
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void saveSettingsSection("comboTicket", () =>
                    updateComboTicketModeMutation.mutateAsync(comboTicketMode),
                  )
                }
                disabled={updateComboTicketModeMutation.isPending}
              >
                <Save /> Guardar formato
              </Button>
            </div>
          </Field>
          <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30 text-xs">
            <Info className="h-4 w-4 mt-0.5 text-warning-foreground" />
            <span>
              <strong>Importante:</strong> los comprobantes generados son
              internos y <strong>no válidos como factura fiscal AFIP</strong>.
            </span>
          </div>
        </Card>

        <Card
          title="Precios"
          actions={
            <Button
              size="sm"
              onClick={() =>
                void saveSettingsSection("defaultMargin", () =>
                  updateDefaultMarginMutation.mutateAsync(defaultMargin),
                )
              }
              disabled={updateDefaultMarginMutation.isPending}
            >
              <Save /> Guardar
            </Button>
          }
        >
          <Field label="Margen de ganancia predeterminado (%)">
            <div className="relative max-w-[160px]">
              <Input
                type="number"
                min={0}
                step={1}
                value={defaultMargin}
                onChange={(e) => setDefaultMargin(Number(e.target.value))}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                %
              </span>
            </div>
          </Field>
          <p className="text-xs text-muted-foreground">
            Se aplica al crear un producto nuevo. Igual podés modificarlo
            manualmente en cada producto.
          </p>
        </Card>

        <Card title="Categorías globales">
          <p className="text-xs text-muted-foreground -mt-1">
            Las categorías se usan para clasificar los productos del catálogo.
          </p>
          <div className="flex gap-2">
            <Input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Ej. Helados"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCat.trim()) {
                  void addCategory();
                }
              }}
            />
            <Button
              disabled={!newCat.trim() || createCategoryMutation.isPending}
              onClick={() => void addCategory()}
            >
              <Plus /> Agregar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {cats.map((c) => {
              const verifying = productsQuery.isLoading;
              const blocked =
                !verifying &&
                productsQuery.data !== undefined &&
                !canDeleteCategory(c, products);

              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-muted text-sm"
                >
                  {c.name}
                  <button
                    disabled={
                      deleteCategoryMutation.isPending || verifying || blocked
                    }
                    title={
                      verifying
                        ? "Verificando productos asociados"
                        : blocked
                          ? "No se puede eliminar: tiene productos asociados"
                          : "Eliminar categoría"
                    }
                    onClick={() => void deleteCategory(c)}
                    className="h-5 w-5 rounded-full hover:bg-destructive/10 hover:text-destructive inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Eliminar ${c.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Solo se pueden borrar categorías sin productos asociados.
          </p>
        </Card>

        <Card
          title={`Métodos de pago (${pays.length})`}
          collapsed={!paymentMethodsOpen}
          contentId="payment-methods-content"
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={paymentMethodsOpen}
              aria-controls="payment-methods-content"
              onClick={() => setPaymentMethodsOpen((current) => !current)}
            >
              <ChevronDown
                className={`transition-transform ${paymentMethodsOpen ? "rotate-180" : ""}`}
              />
              {paymentMethodsOpen ? "Ocultar" : "Mostrar"}
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground -mt-1">
            Activá los que el local acepta en la pantalla de venta.
          </p>
          <ul className="divide-y divide-border -m-5 mt-0">
            {pays.map((p) => {
              const verifying = salesQuery.isLoading;
              const blocked =
                !verifying &&
                salesQuery.data !== undefined &&
                !canDeletePaymentMethod(p, sales);

              return (
                <li key={p.id} className="space-y-2.5 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        setPays((arr) =>
                          arr.map((x) =>
                            x.id === p.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={() => void savePaymentMethod(p)}
                      className="max-w-xs h-8"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={p.enabled ? "outline" : "secondary"}
                        disabled={updatePaymentMethodMutation.isPending}
                        onClick={() => void togglePaymentMethod(p)}
                      >
                        {p.enabled ? "Activo" : "Inactivo"}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={
                          deletePaymentMethodMutation.isPending ||
                          verifying ||
                          blocked
                        }
                        title={
                          verifying
                            ? "Verificando ventas históricas"
                            : blocked
                              ? "No se puede eliminar: tiene ventas asociadas"
                              : "Eliminar método de pago"
                        }
                        aria-label={`Eliminar ${p.name}`}
                        onClick={() => void deletePaymentMethod(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`payment-surcharge-${p.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        Recargo
                      </Label>
                      <div className="relative w-24">
                        <Input
                          id={`payment-surcharge-${p.id}`}
                          inputMode="decimal"
                          value={
                            paymentPercentInputs[p.id] ??
                            basisPointsToPercentInput(p.surchargeBasisPoints)
                          }
                          onChange={(event) =>
                            setPaymentPercentInputs((current) => ({
                              ...current,
                              [p.id]: event.target.value,
                            }))
                          }
                          onBlur={(event) =>
                            void savePaymentSurcharge(
                              p,
                              event.currentTarget.value,
                            )
                          }
                          className="h-8 pr-7 tabular-nums"
                          aria-label={`Recargo de ${p.name}`}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={p.cashHandling}
                        disabled={updatePaymentMethodMutation.isPending}
                        onCheckedChange={() => void toggleCashHandling(p)}
                        aria-label={`Calcula vuelto para ${p.name}`}
                      />
                      Calcula vuelto
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground pt-3">
            Los métodos con ventas históricas se pueden desactivar, pero no
            borrar.
          </p>
          <div className="flex gap-2 mt-3 pt-3 border-t border-border">
            <Input
              value={newPay}
              onChange={(e) => setNewPay(e.target.value)}
              placeholder="Ej. Mercado Pago"
            />
            <Button
              disabled={!newPay.trim() || createPaymentMethodMutation.isPending}
              onClick={() => void addPaymentMethod()}
            >
              <Plus /> Agregar
            </Button>
          </div>
        </Card>

        <Card
          title={`Cupones (${coupons.length})`}
          actions={
            <Button size="sm" onClick={openNewCoupon}>
              <Plus /> Nuevo cupón
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground -mt-1">
            Definí descuentos reutilizables para aplicar al confirmar una venta.
          </p>
          {couponsQuery.isLoading && (
            <div className="py-5 text-center text-sm text-muted-foreground">
              Cargando cupones...
            </div>
          )}
          {couponsQuery.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              No se pudieron cargar los cupones.
            </div>
          )}
          {!couponsQuery.isLoading && !couponsQuery.error && (
            <ul className="divide-y divide-border -m-5 mt-0">
              {coupons.length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-muted-foreground">
                  Todavía no hay cupones creados.
                </li>
              )}
              {coupons.map((coupon) => {
                const verifying = salesQuery.isLoading;
                const blocked =
                  !verifying &&
                  salesQuery.data !== undefined &&
                  !canDeleteCoupon(coupon, sales);

                return (
                  <li
                    key={coupon.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{coupon.code}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {getCouponDiscountLabel(coupon)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {coupon.enabled ? "Activo" : "Inactivo"}
                        {blocked ? " · Tiene ventas asociadas" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={coupon.enabled}
                        disabled={updateCouponMutation.isPending}
                        onCheckedChange={() => void toggleCoupon(coupon)}
                        aria-label={`${coupon.enabled ? "Desactivar" : "Activar"} ${coupon.code}`}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        disabled={updateCouponMutation.isPending}
                        onClick={() => openEditCoupon(coupon)}
                        aria-label={`Editar ${coupon.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={
                          deleteCouponMutation.isPending || verifying || blocked
                        }
                        title={
                          verifying
                            ? "Verificando ventas históricas"
                            : blocked
                              ? "Tiene ventas asociadas; desactivá el cupón"
                              : "Eliminar cupón"
                        }
                        onClick={() => setCouponToDelete(coupon)}
                        aria-label={`Eliminar ${coupon.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground pt-3">
            Los cupones usados se conservan para mantener el historial y pueden
            desactivarse.
          </p>
        </Card>

        <Card title="Backups y datos">
          <p className="text-xs text-muted-foreground -mt-1 mb-2">
            Generá una copia de seguridad de productos, ventas y compras.
          </p>
          <div className="text-xs text-muted-foreground">
            Último backup:{" "}
            <span className="text-foreground font-medium">
              {backupsQuery.isLoading
                ? "Cargando..."
                : formatBackupDate(latestBackup?.createdAt)}
            </span>
          </div>
          {latestBackup && (
            <div className="text-xs text-muted-foreground">
              {latestBackup.filename} ·{" "}
              {formatBackupSize(latestBackup.sizeBytes)}
            </div>
          )}
          <Button
            className="mt-1 self-start"
            disabled={createBackupMutation.isPending}
            onClick={() =>
              void createBackupMutation
                .mutateAsync()
                .then(() => toast.success("Backup creado."))
                .catch((error) =>
                  toast.error(
                    getMutationErrorMessage(
                      error,
                      "No se pudo crear el backup.",
                    ),
                  ),
                )
            }
          >
            <Database /> Crear backup
          </Button>
        </Card>

        <Card title="Impresora">
          <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
            <div className="h-9 w-9 rounded-md bg-accent/10 text-accent flex items-center justify-center">
              <Printer className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">
                Impresión de comprobantes
              </div>
              <div className="text-xs text-muted-foreground">
                Usá la impresora o el destino PDF del navegador.
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground font-medium">
              Local
            </span>
          </div>
          {!printerBridge && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
              Al imprimir se abrirá el diálogo del navegador. Allí podés elegir
              una impresora o guardar el comprobante como PDF.
            </div>
          )}
          {printerBridge && (
            <>
              <Field label="Impresora">
                <Select
                  value={selectedPrinterValue}
                  onValueChange={setSelectedPrinterValue}
                  disabled={printersQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar impresora" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SYSTEM_DIALOG_SELECTION}>
                      Usar diálogo del sistema
                    </SelectItem>
                    {(printersQuery.data ?? []).map((printer) => (
                      <SelectItem key={printer.name} value={printer.name}>
                        {printer.displayName}
                        {printer.recommended ? " · recomendada" : ""}
                        {printer.isDefault ? " · predeterminada" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                className="self-start"
                disabled={savePrinterMutation.isPending}
                onClick={() =>
                  void savePrinterMutation
                    .mutateAsync(selectedPrinterValue)
                    .then(() => toast.success("Impresora guardada."))
                    .catch((error) =>
                      toast.error(
                        getMutationErrorMessage(
                          error,
                          "No se pudo guardar la impresora.",
                        ),
                      ),
                    )
                }
              >
                <Save /> Guardar impresora
              </Button>
            </>
          )}
          <Field label="Ancho de papel">
            <Input defaultValue="58 mm" disabled />
          </Field>
        </Card>

        <Card title="Modo del sistema" className="lg:col-span-2">
          <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
            <div className="h-9 w-9 rounded-md bg-primary/5 text-primary flex items-center justify-center">
              <Monitor className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium">
                Uso local en una computadora
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={couponDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCouponDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {couponForm.id ? "Editar cupón" : "Nuevo cupón"}
            </DialogTitle>
            <DialogDescription>
              El código se normaliza en mayúsculas y debe ser único.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Código">
              <Input
                value={couponForm.code}
                onChange={(event) =>
                  setCouponForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="Ej. VERANO10"
                autoFocus
              />
            </Field>
            <Field label="Tipo de descuento">
              <Select
                value={couponForm.discountType}
                onValueChange={(value) =>
                  setCouponForm((current) => ({
                    ...current,
                    discountType: value as CouponDiscountType,
                    valueInput: "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Porcentaje</SelectItem>
                  <SelectItem value="FixedAmount">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={
                couponForm.discountType === "Percentage"
                  ? "Descuento (%)"
                  : "Descuento (ARS)"
              }
            >
              <div className="relative">
                <Input
                  inputMode="decimal"
                  value={couponForm.valueInput}
                  onChange={(event) =>
                    setCouponForm((current) => ({
                      ...current,
                      valueInput: event.target.value,
                    }))
                  }
                  placeholder={
                    couponForm.discountType === "Percentage"
                      ? "Ej. 10"
                      : "Ej. $2.500"
                  }
                  className={
                    couponForm.discountType === "Percentage" ? "pr-9" : ""
                  }
                />
                {couponForm.discountType === "Percentage" && (
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                )}
              </div>
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
              <span>
                <span className="block font-medium">Cupón activo</span>
                <span className="block text-xs text-muted-foreground">
                  Puede aplicarse en ventas nuevas.
                </span>
              </span>
              <Switch
                checked={couponForm.enabled}
                onCheckedChange={(enabled) =>
                  setCouponForm((current) => ({ ...current, enabled }))
                }
                aria-label="Cupón activo"
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCouponDialog}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                createCouponMutation.isPending ||
                updateCouponMutation.isPending ||
                !couponForm.code.trim() ||
                !couponForm.valueInput.trim()
              }
              onClick={() => void saveCoupon()}
            >
              {(createCouponMutation.isPending ||
                updateCouponMutation.isPending) && (
                <LoaderCircle className="animate-spin" />
              )}
              Guardar cupón
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={couponToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteCouponMutation.isPending) {
            setCouponToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cupón</AlertDialogTitle>
            <AlertDialogDescription>
              {couponToDelete
                ? `Se eliminará ${couponToDelete.code}. Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCouponMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCouponMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void deleteCoupon();
              }}
            >
              {deleteCouponMutation.isPending && (
                <LoaderCircle className="animate-spin" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Card({
  title,
  children,
  className = "",
  actions,
  collapsed = false,
  contentId,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  collapsed?: boolean;
  contentId?: string;
}) {
  return (
    <div className={`bg-card border border-border rounded-lg ${className}`}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {actions}
      </div>
      {!collapsed && (
        <div id={contentId} className="p-5 flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
