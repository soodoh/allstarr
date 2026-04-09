import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@vitest/browser/utils";
import type { PropsWithChildren, ReactElement } from "react";
import { useState } from "react";
import { TooltipProvider } from "src/components/ui/tooltip";

function createTestQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
				gcTime: Number.POSITIVE_INFINITY,
				staleTime: 30_000,
			},
			mutations: {
				retry: false,
				gcTime: Number.POSITIVE_INFINITY,
			},
		},
	});
}

function TestProviders({ children }: PropsWithChildren): ReactElement {
	const [queryClient] = useState(createTestQueryClient);

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>{children}</TooltipProvider>
		</QueryClientProvider>
	);
}

export function renderWithProviders(ui: ReactElement) {
	return render(ui, { wrapper: TestProviders });
}

export { render };

export function renderHookWithProviders<Result, Props>(
	callback: (initialProps: Props) => Result,
) {
	return renderHook(callback, { wrapper: TestProviders });
}

export { renderHook };
