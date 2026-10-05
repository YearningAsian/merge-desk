"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { TooltipProvider } from "@/ui/primitives/tooltip";

// Fetched data lives in TanStack Query. Nothing that spends quota or writes
// is retried automatically; reads refetch when the window regains focus.
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
