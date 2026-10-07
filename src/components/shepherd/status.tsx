import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PlugZap, XCircle, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Status } from "@/lib/mock-data";

const map: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  success: { label: "成功", cls: "bg-success-soft text-success border-success/25", Icon: CheckCircle2 },
  error: { label: "エラー", cls: "bg-danger-soft text-destructive border-destructive/25", Icon: XCircle },
  failed: { label: "失敗", cls: "bg-danger-soft text-destructive border-destructive/25", Icon: XCircle },
  validation_error: { label: "検証エラー", cls: "bg-danger-soft text-destructive border-destructive/25", Icon: XCircle },
  warning: { label: "警告", cls: "bg-warning-soft text-warning border-warning/30", Icon: AlertTriangle },
  processing: { label: "検証中", cls: "bg-info-soft text-info border-info/25", Icon: Loader2 },
  idle: { label: "未実行", cls: "bg-neutral-soft text-muted-foreground border-border", Icon: CircleDashed },
  disconnected: { label: "未接続", cls: "bg-neutral-soft text-muted-foreground border-border", Icon: PlugZap },
};

export function StatusBadge({ status, label, className }: { status: Status; label?: string | undefined; className?: string }) {
  const { label: l, cls, Icon } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none", cls, className)}>
      <Icon className={cn("h-3 w-3", status === "processing" && "animate-spin")} />
      {label ?? l}
    </span>
  );
}

function Banner({ tone, title, children, action }: { tone: "error" | "success" | "info" | "warning"; title: string; children?: ReactNode; action?: ReactNode }) {
  const t = {
    error: { cls: "border-destructive/40 bg-danger-soft text-destructive", Icon: XCircle },
    success: { cls: "border-success/40 bg-success-soft text-success", Icon: CheckCircle2 },
    info: { cls: "border-info/30 bg-info-soft text-info", Icon: Info },
    warning: { cls: "border-warning/40 bg-warning-soft text-warning", Icon: AlertTriangle },
  }[tone];
  return (
    <div role="alert" className={cn("flex items-start gap-3 rounded-md border px-4 py-3", t.cls)}>
      <t.Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-1 text-xs text-foreground/80">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export const ErrorAlert = (p: Omit<Parameters<typeof Banner>[0], "tone">) => <Banner tone="error" {...p} />;
export const SuccessAlert = (p: Omit<Parameters<typeof Banner>[0], "tone">) => <Banner tone="success" {...p} />;
export const InfoAlert = (p: Omit<Parameters<typeof Banner>[0], "tone">) => <Banner tone="info" {...p} />;
export const WarningAlert = (p: Omit<Parameters<typeof Banner>[0], "tone">) => <Banner tone="warning" {...p} />;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "default", hint }: { label: string; value: ReactNode; icon: typeof Info; tone?: "default" | "success" | "error" | "warning" | "info"; hint?: string }) {
  const toneCls = { default: "text-foreground", success: "text-success", error: "text-destructive", warning: "text-warning", info: "text-info" }[tone];
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={cn("h-4 w-4", toneCls)} />
      </div>
      <div className={cn("mt-2 font-mono text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
