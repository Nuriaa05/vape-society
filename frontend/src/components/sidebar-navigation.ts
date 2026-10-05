export type SidebarNavigationEvent =
  | "pointerenter"
  | "click"
  | "navigate-start"
  | "navigate-complete"
  | "navigate-error";

export type SidebarNavigationLogEntry = {
  scope: "sidebar-navigation";
  event: SidebarNavigationEvent;
  label: string;
  from: string;
  to: string;
  timestamp: string;
  error?: string;
};

export function getSidebarAriaCurrent(active: boolean): "page" | undefined {
  return active ? "page" : undefined;
}

export function formatSidebarNavigationError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function createSidebarNavigationLogEntry({
  error,
  event,
  from,
  label,
  now = () => new Date(),
  to,
}: {
  event: SidebarNavigationEvent;
  from: string;
  label: string;
  now?: () => Date;
  to: string;
  error?: unknown;
}): SidebarNavigationLogEntry {
  return {
    scope: "sidebar-navigation",
    event,
    from,
    label,
    timestamp: now().toISOString(),
    to,
    ...(error === undefined
      ? {}
      : { error: formatSidebarNavigationError(error) }),
  };
}

export function logSidebarNavigation(entry: SidebarNavigationLogEntry): void {
  const payload = JSON.stringify(entry);

  if (entry.event === "navigate-error") {
    console.error("[sidebar-navigation]", payload);
    return;
  }

  console.info("[sidebar-navigation]", payload);
}
