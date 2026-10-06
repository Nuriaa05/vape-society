import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { DataExportControls } from "@/components/data-export-controls";
import { SettingsReceiptPreview } from "@/components/settings-receipt-preview";
import {
  SettingsSectionNavigation,
  type SettingsSection,
} from "@/components/settings-section-navigation";
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
  Database,
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
  const [activeSection, setActiveSection] = useState<SettingsSection>("local");
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
    setBiz(settings.business);
  }, [settings.business]);

  useEffect(() => {
    setTicket(settings.receipt);
  }, [settings.receipt]);

  useEffect(() => {
    setComboTicketMode(settings.comboTicketMode ?? "ComboLine");
  }, [settings.comboTicketMode]);

  useEffect(() => {
    setDefaultMargin(settings.defaultMargin);
  }, [settings.defaultMargin]);

  useEffect(() => {
    setCats(settings.categories);
  }, [settings.categories]);

  useEffect(() => {
    setPays(settings.paymentMethods);
    setPaymentPercentInputs(
      Object.fromEntries(
        settings.paymentMethods.map((method) => [
          method.id,
          basisPointsToPercentInput(method.surchargeBasisPoints),
        ]),
      ),
    );
  }, [settings.paymentMethods]);

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
      <AppShell title="Configuración">
        <Card className="app-card-body text-sm text-muted-foreground">
          Cargando configuración...
        </Card>
      </AppShell>
    );
  }

  if (settingsQuery.error) {
    return (
      <AppShell title="Configuración">
        <Card className="app-card-body text-sm text-destructive">
          No se pudo cargar la configuración.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configuración">
      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-7">
        <SettingsSectionNavigation
          selected={activeSection}
          categoryCount={cats.length}
          onSelect={setActiveSection}
        />
        <div className="mx-auto w-full min-w-0 max-w-[1080px]">
          <section
            id="settings-panel-local"
            aria-labelledby="settings-nav-local"
            hidden={activeSection !== "local"}
            className="space-y-5"
          >
            <SettingsCard
              title="Datos del local"
              description="Información que aparece en los comprobantes."
              actions={
                <Button
                  size="sm"
                  type="button"
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
              <div>
                <SettingsRow label="Nombre del local" inputId="business-name">
                  <Input
                    id="business-name"
                    placeholder="Nombre del local"
                    value={biz.name}
                    onChange={(e) => setBiz({ ...biz, name: e.target.value })}
                  />
                </SettingsRow>
                <SettingsRow label="Dirección" inputId="business-address">
                  <Input
                    id="business-address"
                    placeholder="Dirección del local"
                    value={biz.address}
                    onChange={(e) =>
                      setBiz({ ...biz, address: e.target.value })
                    }
                  />
                </SettingsRow>
                <SettingsRow
                  label="CUIT"
                  description="Opcional"
                  inputId="business-cuit"
                >
                  <Input
                    id="business-cuit"
                    placeholder="Número de CUIT"
                    aria-describedby="business-cuit-description"
                    value={biz.cuit}
                    onChange={(e) => setBiz({ ...biz, cuit: e.target.value })}
                  />
                </SettingsRow>
                <SettingsRow label="Teléfono" inputId="business-phone">
                  <Input
                    id="business-phone"
                    type="tel"
                    placeholder="Número de teléfono"
                    value={biz.phone}
                    onChange={(e) => setBiz({ ...biz, phone: e.target.value })}
                  />
                </SettingsRow>
              </div>
            </SettingsCard>
            <SettingsCard title="Modo del sistema">
              <div className="flex items-center gap-3">
                <Monitor
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm">Uso local en una computadora</span>
              </div>
            </SettingsCard>
          </section>
          <section
            id="settings-panel-sales"
            aria-labelledby="settings-nav-sales"
            hidden={activeSection !== "sales"}
            className="space-y-5"
          >
            <SettingsCard
              title="Precios"
              actions={
                <Button
                  size="sm"
                  type="button"
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
              <SettingsRow
                label="Margen de ganancia predeterminado (%)"
                description="Se aplica al crear un producto. Podés cambiarlo en cada uno."
                inputId="default-margin"
              >
                <div className="relative w-32">
                  <Input
                    id="default-margin"
                    placeholder="0"
                    aria-describedby="default-margin-description"
                    type="number"
                    min={0}
                    step={1}
                    value={defaultMargin}
                    onChange={(e) => setDefaultMargin(Number(e.target.value))}
                    className="pr-8 text-right tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </SettingsRow>
            </SettingsCard>
            <SettingsCard
              title="Métodos de pago"
              description={`${pays.filter((method) => method.enabled).length} activos de ${pays.length}`}
            >
              <ul className="divide-y divide-border">
                {pays.map((p) => {
                  const verifying = salesQuery.isLoading;
                  const blocked =
                    !verifying &&
                    salesQuery.data !== undefined &&
                    !canDeletePaymentMethod(p, sales);
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 first:pt-0"
                    >
                      <Input
                        value={p.name}
                        placeholder="Nombre del método de pago"
                        onChange={(e) =>
                          setPays((arr) =>
                            arr.map((x) =>
                              x.id === p.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          )
                        }
                        onBlur={() => void savePaymentMethod(p)}
                        aria-label={`Nombre del método ${p.name}`}
                        className="w-full sm:min-w-40 sm:flex-1 sm:basis-40"
                      />
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`payment-surcharge-${p.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Recargo
                        </Label>
                        <div className="relative w-20">
                          <Input
                            id={`payment-surcharge-${p.id}`}
                            inputMode="decimal"
                            placeholder="0"
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
                            className="pr-7 tabular-nums"
                            aria-label={`Recargo de ${p.name}`}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                      </div>
                      <label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                          checked={p.cashHandling}
                          disabled={updatePaymentMethodMutation.isPending}
                          onCheckedChange={() => void toggleCashHandling(p)}
                          aria-label={`Calcula vuelto para ${p.name}`}
                        />
                        Calcula vuelto
                      </label>
                      <div className="ml-auto flex items-center gap-3">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={
                            deletePaymentMethodMutation.isPending ||
                            verifying ||
                            blocked ||
                            Boolean(salesQuery.error)
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
                          <Trash2 />
                        </Button>
                        <label className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
                          {p.enabled ? "Activo" : "Inactivo"}
                          <Switch
                            checked={p.enabled}
                            disabled={updatePaymentMethodMutation.isPending}
                            onCheckedChange={() => void togglePaymentMethod(p)}
                            aria-label={`Método activo: ${p.name}`}
                          />
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                <Input
                  value={newPay}
                  onChange={(e) => setNewPay(e.target.value)}
                  placeholder="Nombre del método de pago"
                  aria-label="Nombre del método de pago"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !newPay.trim() || createPaymentMethodMutation.isPending
                  }
                  onClick={() => void addPaymentMethod()}
                >
                  <Plus /> Agregar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Los métodos con ventas históricas se pueden desactivar, pero no
                borrar.
              </p>
            </SettingsCard>
            <SettingsCard
              title="Cupones"
              description="Descuentos que podés aplicar al confirmar una venta."
              actions={
                <Button size="sm" onClick={openNewCoupon}>
                  <Plus /> Nuevo cupón
                </Button>
              }
            >
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
                <ul className="divide-y divide-border">
                  {coupons.length === 0 && (
                    <li className="py-4 text-sm text-muted-foreground">
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
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
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
                            className="text-muted-foreground"
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
                            className="text-muted-foreground hover:text-destructive"
                            disabled={
                              deleteCouponMutation.isPending ||
                              verifying ||
                              blocked
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
                Los cupones usados se conservan para mantener el historial y
                pueden desactivarse.
              </p>
            </SettingsCard>
          </section>
          <section
            id="settings-panel-catalog"
            aria-labelledby="settings-nav-catalog"
            hidden={activeSection !== "catalog"}
          >
            <SettingsCard
              title="Categorías"
              description="Clasifican los productos del catálogo."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  placeholder="Nombre de la categoría"
                  aria-label="Nombre de la categoría"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      newCat.trim() &&
                      !createCategoryMutation.isPending
                    )
                      void addCategory();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newCat.trim() || createCategoryMutation.isPending}
                  onClick={() => void addCategory()}
                >
                  <Plus /> Agregar
                </Button>
              </div>
              <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
                {cats.map((c) => {
                  const verifying = productsQuery.isLoading;
                  const count = products.filter(
                    (product) =>
                      product.categoryId === c.id ||
                      product.category === c.name,
                  ).length;
                  const blocked =
                    !verifying &&
                    productsQuery.data !== undefined &&
                    !canDeleteCategory(c, products);
                  return (
                    <li
                      key={c.id}
                      className="flex min-w-0 items-center justify-between gap-3 border-t border-border py-3"
                    >
                      <span className="min-w-0 break-words text-sm">
                        {c.name}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {productsQuery.isLoading
                            ? "..."
                            : productsQuery.error
                              ? "Sin datos"
                              : `${count} ${count === 1 ? "producto" : "productos"}`}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={
                            deleteCategoryMutation.isPending ||
                            verifying ||
                            blocked ||
                            Boolean(productsQuery.error)
                          }
                          title={
                            verifying
                              ? "Verificando productos asociados"
                              : blocked
                                ? "No se puede eliminar: tiene productos asociados"
                                : "Eliminar categoría"
                          }
                          onClick={() => void deleteCategory(c)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Eliminar ${c.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
                {cats.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">
                    Todavía no hay categorías. Agregá una para organizar el
                    catálogo.
                  </li>
                )}
              </ul>
              <p className="text-xs text-muted-foreground">
                Solo se pueden borrar categorías sin productos asociados.
              </p>
            </SettingsCard>
          </section>
          <section
            id="settings-panel-receipts"
            aria-labelledby="settings-nav-receipts"
            hidden={activeSection !== "receipts"}
          >
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-7">
              <div className="min-w-0 space-y-5">
                <SettingsCard
                  title="Comprobante interno"
                  description="Comprobante interno: no válido como factura fiscal."
                  actions={
                    <Button
                      size="sm"
                      type="button"
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
                  <div>
                    <SettingsRow
                      label="Encabezado del ticket"
                      inputId="receipt-header"
                    >
                      <Input
                        id="receipt-header"
                        placeholder="Encabezado del comprobante"
                        value={ticket.header}
                        onChange={(e) =>
                          setTicket({ ...ticket, header: e.target.value })
                        }
                      />
                    </SettingsRow>
                    <div className="space-y-2 border-b border-border py-4">
                      <Label htmlFor="receipt-footer" className="text-sm">
                        Pie del ticket
                      </Label>
                      <Textarea
                        id="receipt-footer"
                        placeholder="Texto al final del comprobante"
                        rows={3}
                        value={ticket.footer}
                        onChange={(e) =>
                          setTicket({ ...ticket, footer: e.target.value })
                        }
                      />
                    </div>
                    <SettingsRow
                      label="Combos en el ticket"
                      description="Cómo se muestran los productos de un combo."
                      inputId="receipt-combo-mode"
                    >
                      <div className="flex flex-col items-stretch gap-2">
                        <Select
                          value={comboTicketMode}
                          onValueChange={(value) =>
                            setComboTicketMode(
                              value as NonNullable<
                                LocalSettings["comboTicketMode"]
                              >,
                            )
                          }
                        >
                          <SelectTrigger
                            id="receipt-combo-mode"
                            aria-describedby="receipt-combo-mode-description"
                          >
                            <SelectValue placeholder="Seleccionar formato" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ComboLine">
                              Una línea por combo
                            </SelectItem>
                            <SelectItem value="ComboWithComponents">
                              Combo + componentes sin precios
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          className="self-end"
                          onClick={() =>
                            void saveSettingsSection("comboTicket", () =>
                              updateComboTicketModeMutation.mutateAsync(
                                comboTicketMode,
                              ),
                            )
                          }
                          disabled={updateComboTicketModeMutation.isPending}
                        >
                          <Save /> Guardar formato
                        </Button>
                      </div>
                    </SettingsRow>
                  </div>
                </SettingsCard>
                <SettingsCard title="Impresora">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
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
                    <span className="text-xs text-muted-foreground font-medium">
                      Local
                    </span>
                  </div>
                  {!printerBridge && (
                    <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                      Al imprimir se abrirá el diálogo del navegador. Allí podés
                      elegir una impresora o guardar el comprobante como PDF.
                    </div>
                  )}
                  {printerBridge && (
                    <>
                      <Field label="Impresora" inputId="printer-selection">
                        <Select
                          value={selectedPrinterValue}
                          onValueChange={setSelectedPrinterValue}
                          disabled={printersQuery.isLoading}
                        >
                          <SelectTrigger id="printer-selection">
                            <SelectValue placeholder="Seleccionar impresora" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={SYSTEM_DIALOG_SELECTION}>
                              Usar diálogo del sistema
                            </SelectItem>
                            {(printersQuery.data ?? []).map((printer) => (
                              <SelectItem
                                key={printer.name}
                                value={printer.name}
                              >
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
                  <Field label="Ancho de papel" inputId="printer-paper-width">
                    <Input
                      id="printer-paper-width"
                      placeholder="Ancho de papel"
                      defaultValue="58 mm"
                      disabled
                    />
                  </Field>
                </SettingsCard>
              </div>
              <SettingsReceiptPreview
                business={biz}
                receipt={ticket}
                comboTicketMode={comboTicketMode}
              />
            </div>
          </section>
          <section
            id="settings-panel-data"
            aria-labelledby="settings-nav-data"
            hidden={activeSection !== "data"}
            className="space-y-5"
          >
            <SettingsCard
              title="Copias de seguridad"
              description="Respaldo de los datos del sistema."
            >
              <SettingsRow
                label="Último backup"
                description={
                  <>
                    <span>
                      {backupsQuery.isLoading
                        ? "Cargando..."
                        : backupsQuery.error
                          ? "No se pudieron cargar los backups."
                          : formatBackupDate(latestBackup?.createdAt)}
                      {latestBackup &&
                        ` · ${formatBackupSize(latestBackup.sizeBytes)}`}
                    </span>
                    {latestBackup && (
                      <span className="mt-1 block break-words">
                        {latestBackup.filename}
                      </span>
                    )}
                  </>
                }
              >
                <Button
                  type="button"
                  className="ml-auto"
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
                  {createBackupMutation.isPending ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Database />
                  )}{" "}
                  Crear backup ahora
                </Button>
              </SettingsRow>
            </SettingsCard>
            <SettingsCard
              title="Exportar datos"
              description="Descargá una tabla CSV para Excel o Google Sheets."
            >
              <DataExportControls />
            </SettingsCard>
          </section>
        </div>
      </div>

      <Dialog
        open={couponDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeCouponDialog();
        }}
      >
        <DialogContent className="settings-controls">
          <DialogHeader>
            <DialogTitle>
              {couponForm.id ? "Editar cupón" : "Nuevo cupón"}
            </DialogTitle>
            <DialogDescription>
              El código se normaliza en mayúsculas y debe ser único.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Código" inputId="coupon-code">
              <Input
                id="coupon-code"
                value={couponForm.code}
                onChange={(event) =>
                  setCouponForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
                placeholder="Código del cupón"
                autoFocus
              />
            </Field>
            <Field label="Tipo de descuento" inputId="coupon-discount-type">
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
                <SelectTrigger id="coupon-discount-type">
                  <SelectValue placeholder="Seleccionar tipo de descuento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentage">Porcentaje</SelectItem>
                  <SelectItem value="FixedAmount">Monto fijo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              inputId="coupon-discount-value"
              label={
                couponForm.discountType === "Percentage"
                  ? "Descuento (%)"
                  : "Descuento (ARS)"
              }
            >
              <div className="relative">
                <Input
                  id="coupon-discount-value"
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
                      ? "Porcentaje de descuento"
                      : "Importe del descuento"
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

function SettingsCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="settings-controls">
      <CardHeader
        title={title}
        description={description}
        action={actions}
        className="items-start px-6 pt-6 pb-0"
      />
      <CardBody className="flex flex-col gap-4 px-6 pt-5 pb-6">
        {children}
      </CardBody>
    </Card>
  );
}

function SettingsRow({
  label,
  description,
  inputId,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  inputId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0 ${
        inputId
          ? "flex flex-col gap-2"
          : "grid items-center gap-3 md:grid-cols-2 md:gap-6"
      }`}
    >
      <div className="min-w-0">
        {inputId ? (
          <Label htmlFor={inputId} className="text-sm">
            {label}
          </Label>
        ) : (
          <p className="text-sm">{label}</p>
        )}
        {description && (
          <p
            id={inputId ? `${inputId}-description` : undefined}
            className="mt-1 text-xs text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
      <div
        className={`w-full min-w-0 ${inputId ? "" : "md:max-w-sm md:justify-self-end"}`}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  inputId,
  children,
}: {
  label: string;
  inputId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
