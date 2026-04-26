import {
	createContext,
	type JSX,
	type ReactNode,
	useContext,
	useState,
} from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

type Query = {
	queryKey?: readonly unknown[];
};

const metadataRouteMocks = vi.hoisted(() => ({
	profile: {
		minimumPages: 0,
		minimumPopularity: 0,
		skipCompilations: false,
		skipMissingIsbnAsin: false,
		skipMissingReleaseDate: false,
	},
	profileMutate: {
		isPending: false,
		mutate: vi.fn(),
	},
	settingsMap: {} as Record<string, unknown>,
	settingsMutate: {
		isPending: false,
		mutate: vi.fn(),
	},
	useQuery: vi.fn(),
	useSuspenseQuery: vi.fn(),
	validateForm: vi.fn(),
}));

const TabsContext = createContext<{
	value: string;
	onValueChange?: (value: string) => void;
} | null>(null);

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
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			metadataRouteMocks.useQuery(...args),
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			metadataRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("src/components/shared/language-single-select", () => ({
	default: ({
		onChange,
		value,
	}: {
		onChange: (value: string) => void;
		value: string;
	}) => (
		<button type="button" onClick={() => onChange("fr")}>
			{value}
		</button>
	),
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		disabled,
		onClick,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onClick?: () => void;
	}) => (
		<button disabled={disabled} onClick={onClick} type="button">
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
		id,
		onChange,
		type,
		value,
	}: {
		id?: string;
		onChange?: (event: { target: { value: string } }) => void;
		type?: string;
		value?: string | number;
	}) => <input id={id} onChange={onChange} type={type} value={value} />,
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

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({
		children,
		defaultValue,
	}: {
		children: ReactNode;
		defaultValue: string;
	}) => {
		const [value, setValue] = useState(defaultValue);
		return (
			<TabsContext.Provider value={{ onValueChange: setValue, value }}>
				<div>{children}</div>
			</TabsContext.Provider>
		);
	},
	TabsContent: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => {
		const context = useContext(TabsContext);

		return context?.value === value ? <div>{children}</div> : null;
	},
	TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TabsTrigger: ({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) => {
		const context = useContext(TabsContext);

		return (
			<button onClick={() => context?.onValueChange?.(value)} type="button">
				{children}
			</button>
		);
	},
}));

vi.mock("src/hooks/mutations", () => ({
	useUpdateMetadataProfile: () => metadataRouteMocks.profileMutate,
	useUpdateSettings: () => metadataRouteMocks.settingsMutate,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: vi.fn(),
}));

vi.mock("src/lib/form-validation", () => ({
	default: (...args: unknown[]) => metadataRouteMocks.validateForm(...args),
}));

vi.mock("src/lib/queries", () => ({
	metadataProfileQuery: () => ({ queryKey: ["metadataProfile"] }),
	settingsMapQuery: () => ({ queryKey: ["settingsMap"] }),
}));

vi.mock("src/lib/validators", () => ({
	metadataProfileSchema: {},
}));

import { Route } from "./metadata";

function renderRoute() {
	const route = Route as unknown as {
		component: () => JSX.Element;
		useLoaderData: () => unknown;
	};
	route.useLoaderData = () => undefined;

	return renderWithProviders(<route.component />);
}

describe("metadata route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		metadataRouteMocks.profileMutate.isPending = false;
		metadataRouteMocks.settingsMutate.isPending = false;
		metadataRouteMocks.useSuspenseQuery.mockImplementation((query: Query) => {
			if (query.queryKey?.[0] === "metadataProfile") {
				return { data: metadataRouteMocks.profile };
			}

			return { data: metadataRouteMocks.settingsMap };
		});
		metadataRouteMocks.useQuery.mockImplementation(() => ({
			data: metadataRouteMocks.settingsMap,
			status: "success",
		}));
	});

	it("prefetches the metadata profile and blocks invalid hardcover saves", async () => {
		const ensureQueryData = vi.fn();
		const route = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
		};

		await route.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({ queryKey: ["metadataProfile"] }),
		);

		metadataRouteMocks.validateForm.mockReturnValueOnce({
			errors: { minimumPages: "Minimum pages must be positive" },
			success: false,
		});

		await renderRoute();

		await page.getByRole("button", { name: "Save Hardcover Settings" }).click();

		expect(metadataRouteMocks.profileMutate.mutate).not.toHaveBeenCalled();
		await expect
			.element(page.getByText("Minimum pages must be positive"))
			.toBeInTheDocument();
	});

	it("keeps dirty TMDB edits, hides the sync effect, and saves mapped values", async () => {
		metadataRouteMocks.profile = {
			minimumPages: 50,
			minimumPopularity: 25,
			skipCompilations: true,
			skipMissingIsbnAsin: true,
			skipMissingReleaseDate: true,
		};
		metadataRouteMocks.settingsMap = {
			"metadata.tmdb.includeAdult": false,
			"metadata.tmdb.language": "en",
			"metadata.tmdb.region": "US",
		};
		metadataRouteMocks.validateForm.mockReturnValue({
			data: metadataRouteMocks.profile,
			success: true,
		});

		const route = Route as unknown as {
			component: () => JSX.Element;
			useLoaderData: () => unknown;
		};
		route.useLoaderData = () => undefined;

		const { rerender } = await renderWithProviders(<route.component />);

		await page.getByRole("button", { name: "TMDB" }).click();
		await page.getByRole("button", { name: "en", exact: true }).click();
		await page.getByRole("checkbox").click();

		// Find "No filter" button within the TMDB card section
		await page.getByRole("button", { name: "No filter" }).click();

		metadataRouteMocks.settingsMap = {
			"metadata.tmdb.includeAdult": true,
			"metadata.tmdb.language": "de",
			"metadata.tmdb.region": "CA",
		};
		await rerender(<route.component />);

		await expect
			.element(page.getByRole("button", { name: "fr", exact: true }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Save TMDB Settings" }).click();

		expect(metadataRouteMocks.settingsMutate.mutate).toHaveBeenCalledWith([
			{ key: "metadata.tmdb.language", value: "fr" },
			{ key: "metadata.tmdb.includeAdult", value: true },
			{ key: "metadata.tmdb.region", value: "" },
		]);
	});
});
