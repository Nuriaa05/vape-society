export type SettingsSaveSection =
  | "business"
  | "receipt"
  | "defaultMargin"
  | "comboTicket";

const successMessages: Record<SettingsSaveSection, string> = {
  business: "Datos del local guardados.",
  receipt: "Comprobante interno guardado.",
  defaultMargin: "Margen de ganancia guardado.",
  comboTicket: "Formato de combos guardado.",
};

const errorMessages: Record<SettingsSaveSection, string> = {
  business: "No se pudieron guardar los datos del local.",
  receipt: "No se pudo guardar el comprobante interno.",
  defaultMargin: "No se pudo guardar el margen de ganancia.",
  comboTicket: "No se pudo guardar el formato de combos.",
};

export function getSettingsSaveSuccessMessage(
  section: SettingsSaveSection,
): string {
  return successMessages[section];
}

export function getSettingsSaveErrorMessage(
  section: SettingsSaveSection,
): string {
  return errorMessages[section];
}
