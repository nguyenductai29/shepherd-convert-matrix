import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  HeadContent,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { AppStateProvider, useAppState } from "@/state/app-state";
import { AppSidebar } from "@/components/shepherd/AppSidebar";
import { ErrorAlert } from "@/components/shepherd/status";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-6xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-lg font-semibold text-foreground">ページが見つかりません</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    void import("@/services/platform/logging")
      .then(({ logEvent }) => logEvent("route-error", "error", String(error)))
      .catch(() => undefined);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          ページを読み込めませんでした
        </h1>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            再試行
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            ホーム
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Shepherd Master SQL Generator" },
      {
        name: "description",
        content: "マスタ整備ファイルからDB登録用SQLを安全に生成するための社内ツール",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "icon", href: "/favicon.png", type: "image/png" }],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <AppStateProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="min-w-0 flex-1">
            <StartupNotice />
            <Outlet />
          </main>
        </div>
        <Toaster />
      </AppStateProvider>
    </>
  );
}

function StartupNotice() {
  const { startupError } = useAppState();
  return startupError ? (
    <div className="px-8 pt-4">
      <ErrorAlert title={startupError}>
        <Link to="/settings" className="underline">
          設定を確認
        </Link>
      </ErrorAlert>
    </div>
  ) : null;
}
