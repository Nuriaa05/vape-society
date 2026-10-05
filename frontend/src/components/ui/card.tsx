import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "app-card flex min-w-0 flex-col rounded-lg border border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "app-card-header flex flex-wrap items-center justify-between gap-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="app-card-title font-semibold text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("app-card-body", className)} {...props} />;
}

export function CardToolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "app-card-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "app-card-footer flex flex-wrap items-center justify-between gap-3 border-t border-border",
        className,
      )}
      {...props}
    />
  );
}

export function KpiCard({
  icon,
  label,
  value,
  hint,
  tone,
  accent,
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "warning";
  accent?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("app-metric", className)}>
      <div className="flex items-center justify-between gap-2 text-foreground">
        <span className="app-metric-label font-medium">{label}</span>
        {icon && (
          <span
            className={
              tone === "warning"
                ? "text-warning-foreground"
                : "text-muted-foreground"
            }
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          "app-metric-value break-words font-semibold text-foreground tracking-tight tabular-nums",
          accent && "text-accent",
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="app-metric-hint text-muted-foreground">{hint}</div>
      )}
    </Card>
  );
}
