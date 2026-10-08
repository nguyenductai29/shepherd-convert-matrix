import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Code2,
  Database,
  GitCompareArrows,
  History,
  LayoutDashboard,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppState } from "@/state/app-state";
import { Switch } from "@/components/ui/switch";
import officialLogo from "../../../assets/ShepherdSQL.png";

const items = [
  { to: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { to: "/convert", label: "マスタ変換", icon: ArrowLeftRight },
  { to: "/validation", label: "検証結果", icon: ShieldCheck },
  { to: "/sql", label: "SQLプレビュー", icon: Code2 },
  { to: "/tables", label: "テーブル定義", icon: Database },
  { to: "/mapping", label: "マッピング", icon: GitCompareArrows },
  { to: "/history", label: "変換履歴", icon: History },
  { to: "/settings", label: "設定", icon: Settings },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { dark, toggleDark, conversion } = useAppState();
  const errorCount = conversion.validationResult?.errorCount ?? 0;
  const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));

  return (
    <aside
      data-app-sidebar
      className="flex h-screen min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground"
    >
      <div className="shrink-0 border-b border-sidebar-border px-3 py-3">
        <svg
          role="img"
          aria-label="Shepherd Master SQL Generator"
          viewBox="55 270 1365 520"
          className="block w-full rounded-md bg-white"
        >
          <title>Shepherd Master SQL Generator</title>
          <image href={officialLogo} width="1448" height="1086" />
        </svg>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              active(it.to)
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <it.icon className={cn("h-4 w-4", active(it.to) && "text-sidebar-primary")} />
            {it.label}
            {it.to === "/validation" && errorCount > 0 && (
              <span className="ml-auto rounded bg-destructive px-1.5 font-mono text-[10px] font-semibold text-destructive-foreground">
                {errorCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 space-y-3 border-t border-sidebar-border p-4">
        <label className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-2">
            {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            ダークモード切替
          </span>
          <Switch checked={dark} onCheckedChange={toggleDark} />
        </label>
        <div className="text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">Shepherd</p>
          <p className="font-mono">Version 1.0.0</p>
        </div>
      </div>
    </aside>
  );
}
