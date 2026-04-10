import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentType, PropsWithChildren, ReactElement } from "react";
import { useState } from "react";
import { TooltipProvider } from "src/components/ui/tooltip";
import {
	type RenderHookOptions,
	render,
	renderHook as vbrRenderHook,
} from "vitest-browser-react";

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

function composeWrapper(
	Inner?: ComponentType<PropsWithChildren>,
): ComponentType<PropsWithChildren> {
	if (!Inner) return TestProviders;
	return function ComposedWrapper({ children }: PropsWithChildren) {
		return (
			<TestProviders>
				<Inner>{children}</Inner>
			</TestProviders>
		);
	};
}

export function renderWithProviders(ui: ReactElement) {
	return render(ui, { wrapper: TestProviders });
}

export { render };

export function renderHookWithProviders<Result, Props>(
	callback: (initialProps: Props) => Result,
) {
	return vbrRenderHook(callback, { wrapper: TestProviders });
}

export function renderHook<Result, Props>(
	callback: (initialProps: Props) => Result,
	options?: RenderHookOptions<Props>,
) {
	const { wrapper, ...rest } = options ?? {};
	return vbrRenderHook(callback, {
		...rest,
		wrapper: composeWrapper(wrapper as ComponentType<PropsWithChildren>),
	});
}
