import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type RenderHookOptions,
	type RenderOptions,
	render,
	renderHook as rtlRenderHook,
} from "@testing-library/react";
import { type PropsWithChildren, type ReactElement, useState } from "react";

function createTestQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
			},
		},
	});
}

function TestProviders({ children }: PropsWithChildren): ReactElement {
	const [queryClient] = useState(createTestQueryClient);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

export function renderWithProviders(
	ui: ReactElement,
	options?: Omit<RenderOptions, "wrapper">,
) {
	return render(ui, {
		wrapper: TestProviders,
		...options,
	});
}

export function renderHook<Result, Props>(
	callback: (initialProps: Props) => Result,
	options?: RenderHookOptions<Props>,
) {
	return rtlRenderHook(callback, {
		wrapper: TestProviders,
		...options,
	});
}
