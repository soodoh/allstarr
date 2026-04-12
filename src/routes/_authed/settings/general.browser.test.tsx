import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const generalRouteMocks = vi.hoisted(() => ({
	navigatorClipboardWriteText: vi.fn(),
	regenerateApiKey: {
		isPending: false,
		mutate: vi.fn(),
	},
	settingsMap: {} as Record<string, unknown>,
	updateSettings: {
		isPending: false,
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
}));

const SelectContext = {
	current: null as null | {
		onValueChange?: (value: string) => void;
		value: string;
	},
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			generalRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("lucide-react", () => ({
	Copy: ({ className }: { className?: string }) => (
		<span className={className}>Copy</span>
	),
	RefreshCw: ({ className }: { className?: string }) => (
		<span className={className}>Refresh</span>
	),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("src/components/shared/confirm-dialog", () => ({
	default: ({
		description,
		onConfirm,
		onOpenChange,
		open,
		title,
	}: {
		description: string;
		onConfirm?: () => void;
		onOpenChange?: (open: boolean) => void;
		open: boolean;
		title: string;
	}) =>
		open ? (
			<div>
				<h3>{title}</h3>
				<p>{description}</p>
				<button onClick={() => onOpenChange?.(false)} type="button">
					Cancel
				</button>
				<button onClick={() => onConfirm?.()} type="button">
					Confirm
				</button>
			</div>
		) : null,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
		type,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button" | "submit";
	}) => (
		<button disabled={disabled} onClick={onClick} type={type ?? "button"}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	CardDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
	CardHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	CardTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		readOnly,
		value,
	}: {
		readOnly?: boolean;
		value?: string | number;
	}) => <input readOnly={readOnly} value={value} />,
}));

vi.mock("src/components/ui/label", () => ({
	default: ({
		children,
		htmlFor,
	}: {
		children: ReactNode;
		htmlFor?: string;
	}) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value: string;
	}) => {
		SelectContext.current = { onValueChange, value };
		return <div>{children}</div>;
	},
	SelectContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<button
			onClick={() => SelectContext.current?.onValueChange?.(value)}
			type="button"
		>
			{children}
		</button>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => (
		<button type="button">{children}</button>
	),
	SelectValue: () => <span>{SelectContext.current?.value}</span>,
}));

vi.mock("src/hooks/mutations", () => ({
	useRegenerateApiKey: () => generalRouteMocks.regenerateApiKey,
	useUpdateSettings: () => generalRouteMocks.updateSettings,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: vi.fn(),
}));

vi.mock("src/lib/queries", () => ({
	settingsMapQuery: () => ({ queryKey: ["settingsMap"] }),
}));

import { Route } from "./general";

function renderRoute() {
	const route = Route as unknown as {
		component: () => JSX.Element;
	};

	return renderWithProviders(<route.component />);
}

describe("general route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		generalRouteMocks.regenerateApiKey.isPending = false;
		generalRouteMocks.updateSettings.isPending = false;
		generalRouteMocks.useSuspenseQuery.mockImplementation(() => ({
			data: generalRouteMocks.settingsMap,
		}));
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: generalRouteMocks.navigatorClipboardWriteText,
			},
		});
		generalRouteMocks.navigatorClipboardWriteText.mockResolvedValue(undefined);
		generalRouteMocks.regenerateApiKey.mutate.mockImplementation(
			(
				_: unknown,
				options?: { onSuccess?: (data: { apiKey: string }) => void },
			) => {
				options?.onSuccess?.({ apiKey: "new-api-key" });
			},
		);
	});

	it("defaults the log level, copies the api key, and regenerates successfully", async () => {
		generalRouteMocks.settingsMap = {};

		await renderRoute();

		await expect
			.element(page.getByRole("button", { name: "info", exact: true }))
			.toBeInTheDocument();
		await page.getByRole("button", { name: "Copy" }).click();

		await page.getByRole("button", { name: /Regenerate API Key/ }).click();
		await page.getByRole("button", { name: "Confirm" }).click();
		expect(generalRouteMocks.regenerateApiKey.mutate).toHaveBeenCalledTimes(1);
		await expect
			.element(
				page.elementLocator(
					document.querySelector('input[value="new-api-key"]') as HTMLElement,
				),
			)
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Error" }).click();
		await page.getByRole("button", { name: "Save Settings" }).click();
		expect(generalRouteMocks.updateSettings.mutate).toHaveBeenCalledWith([
			{ key: "general.logLevel", value: "error" },
		]);
	});

	it("keeps the pending controls disabled", async () => {
		generalRouteMocks.settingsMap = {
			"general.apiKey": "existing-key",
			"general.logLevel": "warn",
		};
		generalRouteMocks.regenerateApiKey.isPending = true;
		generalRouteMocks.updateSettings.isPending = true;

		await renderRoute();

		await expect
			.element(page.getByRole("button", { name: "Saving..." }))
			.toBeDisabled();
		await expect
			.element(page.getByRole("button", { name: /Regenerating/ }))
			.toBeDisabled();
		await expect
			.element(
				page.elementLocator(
					document.querySelector('input[value="existing-key"]') as HTMLElement,
				),
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "warn", exact: true }))
			.toBeInTheDocument();
	});
});
