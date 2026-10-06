import { cn } from "@/lib/utils";

export type SettingsSection =
  | "local"
  | "sales"
  | "catalog"
  | "receipts"
  | "data";

export function SettingsSectionNavigation({
  selected,
  categoryCount,
  onSelect,
}: {
  selected: SettingsSection;
  categoryCount: number;
  onSelect: (section: SettingsSection) => void;
}) {
  const sections: {
    id: SettingsSection;
    label: string;
    description: string;
  }[] = [
    { id: "local", label: "Local", description: "Datos y modo del sistema" },
    { id: "sales", label: "Ventas", description: "Precios, pagos y cupones" },
    {
      id: "catalog",
      label: "Catálogo",
      description: `${categoryCount} ${categoryCount === 1 ? "categoría" : "categorías"}`,
    },
    {
      id: "receipts",
      label: "Comprobantes",
      description: "Ticket e impresora",
    },
    { id: "data", label: "Datos", description: "Backups y exportación" },
  ];

  return (
    <nav
      aria-label="Secciones de configuración"
      className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:sticky lg:top-24 lg:flex lg:flex-col"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          id={`settings-nav-${section.id}`}
          type="button"
          aria-current={selected === section.id ? "page" : undefined}
          aria-controls={`settings-panel-${section.id}`}
          onClick={() => onSelect(section.id)}
          className={cn(
            "min-w-0 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            selected === section.id
              ? "bg-muted text-foreground"
              : "text-foreground hover:bg-muted/60",
          )}
        >
          <span
            className={cn(
              "block text-sm",
              selected === section.id && "font-semibold",
            )}
          >
            {section.label}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {section.description}
          </span>
        </button>
      ))}
    </nav>
  );
}
