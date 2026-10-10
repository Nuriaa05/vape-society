import { cn } from "@/lib/utils";
import { useAppearance } from "./appearance-context";

export function AppearanceControl() {
  const { appearance, setAppearance } = useAppearance();

  return (
    <div
      role="group"
      aria-label="Apariencia"
      className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-card p-0.5"
    >
      {(
        [
          ["light", "Claro"],
          ["dark", "Oscuro"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={appearance === value}
          onClick={() => setAppearance(value)}
          className={cn(
            "h-full rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            appearance === value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
