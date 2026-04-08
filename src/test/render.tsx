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
				retry: false,
				gcTime: Number.POSITIVE_INFINITY,
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
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

export function renderWithProviders(
	ui: ReactElement,
	options?: Omit<RenderOptions, "wrapper">,
) {
	return render(ui, {
		...options,
		wrapper: TestProviders,
	});
}

export function renderHook<Result, Props>(
	callback: (initialProps: Props) => Result,
	options?: Omit<RenderHookOptions<Props>, "wrapper">,
) {
	return rtlRenderHook(callback, {
		...options,
		wrapper: TestProviders,
	});
}
