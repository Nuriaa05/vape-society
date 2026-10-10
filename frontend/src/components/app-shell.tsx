import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  ScanBarcode,
  Truck,
  Boxes,
  Users,
  BarChart3,
  Settings,
  ChevronRight,
  Menu,
  Receipt,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import { AppearanceControl } from "./appearance-control";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  createSidebarNavigationLogEntry,
  getSidebarAriaCurrent,
  logSidebarNavigation,
} from "./sidebar-navigation";

type SidebarRoute =
  | "/"
  | "/productos"
  | "/combos"
  | "/nueva-venta"
  | "/ventas"
  | "/compras"
  | "/stock"
  | "/proveedores"
  | "/reportes"
  | "/historial"
  | "/configuracion";

const navItems: {
  to: SidebarRoute;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/nueva-venta", label: "Nueva venta", icon: ScanBarcode },
  { to: "/ventas", label: "Ventas", icon: Receipt },
  { to: "/productos", label: "Productos", icon: Package },
  { to: "/combos", label: "Combos", icon: PackagePlus },
  { to: "/stock", label: "Stock", icon: Boxes },
  { to: "/compras", label: "Compras", icon: Truck },
  { to: "/proveedores", label: "Proveedores", icon: Users },
  { to: "/historial", label: "Historial", icon: History },
  { to: "/reportes", label: "Reportes", icon: BarChart3 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);

  function logNavigationEvent({
    error,
    event,
    from,
    label,
    to,
  }: {
    event:
      | "pointerenter"
      | "click"
      | "navigate-start"
      | "navigate-complete"
      | "navigate-error";
    from: string;
    label: string;
    to: string;
    error?: unknown;
  }) {
    logSidebarNavigation(
      createSidebarNavigationLogEntry({
        error,
        event,
        from,
        label,
        to,
      }),
    );
  }

  function navigateFromSidebar(item: (typeof navItems)[number]) {
    const from = pathname;
    setMenuOpen(false);

    logNavigationEvent({
      event: "click",
      from,
      label: item.label,
      to: item.to,
    });
    logNavigationEvent({
      event: "navigate-start",
      from,
      label: item.label,
      to: item.to,
    });

    void router
      .navigate({ to: item.to })
      .then(() => {
        logNavigationEvent({
          event: "navigate-complete",
          from,
          label: item.label,
          to: item.to,
        });
      })
      .catch((error: unknown) => {
        logNavigationEvent({
          error,
          event: "navigate-error",
          from,
          label: item.label,
          to: item.to,
        });
      });
  }

  const sidebarContent = (
    <>
      <div className="flex flex-col items-center gap-2 border-b border-sidebar-border px-2 pb-5 pt-1">
        <img
          src="/brand/vape-society-logo.png"
          alt="Vape Society"
          width={150}
          height={126}
          className="h-auto w-[150px]"
        />
        <span className="text-xs text-sidebar-muted">Gestión comercial</span>
      </div>
      <nav
        aria-label="Navegación principal"
        className="flex-1 space-y-0.5 py-5"
      >
        <div className="px-2 pb-2 text-xs text-sidebar-muted">Menú</div>
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.to
            : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              type="button"
              aria-current={getSidebarAriaCurrent(active)}
              onPointerEnter={() => {
                logNavigationEvent({
                  event: "pointerenter",
                  from: pathname,
                  label: item.label,
                  to: item.to,
                });
              }}
              onClick={() => navigateFromSidebar(item)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[15.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-hover",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card p-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          VS
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">
            Vape Society
          </div>
          <div className="text-xs text-sidebar-muted">Uso local</div>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "@container/app-shell flex min-h-[var(--app-viewport-height)] w-full bg-background",
        className,
      )}
    >
      <aside className="sticky top-0 hidden h-[var(--app-viewport-height)] w-[236px] shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground @min-[48rem]/app-shell:block print:hidden">
        <div className="flex min-h-full flex-col px-3.5 py-5">
          {sidebarContent}
        </div>
      </aside>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="left-0 top-0 flex h-[var(--app-viewport-height)] max-h-[var(--app-viewport-height)] w-[min(280px,calc(100%-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 border-r border-sidebar-border bg-sidebar px-3.5 py-5 text-sidebar-foreground">
          <DialogHeader className="sr-only">
            <DialogTitle>Menú</DialogTitle>
            <DialogDescription>
              Navegación por las pantallas del sistema.
            </DialogDescription>
          </DialogHeader>
          {sidebarContent}
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6",
            pathname === "/configuracion" &&
              "sticky top-0 z-20 bg-background print:static",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 @min-[48rem]/app-shell:hidden print:hidden"
              aria-label="Abrir menú"
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>
            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="hidden shrink-0 text-muted-foreground sm:inline">
                Vape Society
              </span>
              <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" />
              <h1 className="truncate font-medium text-foreground">{title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {pathname === "/" ? <AppearanceControl /> : null}
            {actions && (
              <div className="flex flex-wrap items-center gap-2 [&>div]:flex-wrap">
                {actions}
              </div>
            )}
          </div>
        </header>
        <main className="app-content w-full flex-1 px-4 pb-8 pt-4 sm:px-6 print:px-0">
          {subtitle && (
            <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
          )}
          <div className="app-page-layout @container/app-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "destructive" | "muted";
  children: ReactNode;
}) {
  const classes = {
    success: "bg-success/10 text-success border border-success/20",
    warning: "bg-warning/15 text-warning-foreground border border-warning/30",
    destructive:
      "bg-destructive/10 text-destructive border border-destructive/20",
    muted: "bg-muted text-muted-foreground border border-border",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium",
        classes,
      )}
    >
      {children}
    </span>
  );
}
