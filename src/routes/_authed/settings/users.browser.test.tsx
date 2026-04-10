import {
	Children,
	cloneElement,
	createContext,
	type JSX,
	type ReactElement,
	type ReactNode,
	useContext,
} from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

type LoaderData = {
	defaultRole: { defaultRole: string };
	oidcProviders: Array<{
		clientId: string;
		clientSecret: string;
		createdAt: Date;
		displayName: string;
		discoveryUrl: string;
		enabled: boolean;
		id: string;
		providerId: string;
		scopes: string[];
		trusted: boolean;
	}>;
	registrationStatus: { registrationDisabled: boolean };
	users: Array<{
		authMethod: string;
		createdAt: Date;
		email: string;
		id: string;
		image: string | null;
		lastLogin: Date | null;
		name: string;
		role: string | null;
	}>;
};

const usersRouteMocks = vi.hoisted(() => ({
	createOidcProviderFn: vi.fn(),
	createUserFn: vi.fn(),
	deleteOidcProviderFn: vi.fn(),
	deleteUserFn: vi.fn(),
	getDefaultRoleFn: vi.fn(),
	getRegistrationStatusFn: vi.fn(),
	invalidate: vi.fn(),
	isAdmin: false,
	listOidcProvidersFn: vi.fn(),
	listUsersFn: vi.fn(),
	setUserRoleFn: vi.fn(),
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
	updateDefaultRoleFn: vi.fn(),
	updateOidcProviderFn: vi.fn(),
}));

const SelectContext = createContext<{
	disabled?: boolean;
	onValueChange?: (value: string) => void;
	value: string;
} | null>(null);

const DialogContext = createContext<{
	onOpenChange?: (open: boolean) => void;
	open: boolean;
} | null>(null);

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
	useRouter: () => ({
		invalidate: usersRouteMocks.invalidate,
	}),
}));

vi.mock("lucide-react", () => ({
	Plus: ({ className }: { className?: string }) => (
		<span className={className}>Plus</span>
	),
	Trash2: ({ className }: { className?: string }) => (
		<span className={className}>Trash</span>
	),
}));

vi.mock("sonner", () => ({
	toast: usersRouteMocks.toast,
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
	default: ({ description, title }: { description: string; title: string }) => (
		<header>
			<h1>{title}</h1>
			<p>{description}</p>
		</header>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
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

vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({
		children,
		onOpenChange,
		open,
	}: {
		children: ReactNode;
		onOpenChange?: (open: boolean) => void;
		open: boolean;
	}) => (
		<DialogContext.Provider value={{ onOpenChange, open }}>
			<div>{children}</div>
		</DialogContext.Provider>
	),
	DialogContent: ({ children }: { children: ReactNode }) => {
		const context = useContext(DialogContext);

		return context?.open ? <div>{children}</div> : null;
	},
	DialogFooter: ({ children }: { children: ReactNode }) => (
		<footer>{children}</footer>
	),
	DialogHeader: ({ children }: { children: ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
	DialogTrigger: ({ children }: { asChild?: boolean; children: ReactNode }) => {
		const context = useContext(DialogContext);
		const child = Children.only(children);

		return cloneElement(
			child as ReactElement,
			{
				onClick: () => context?.onOpenChange?.(true),
			} as never,
		);
	},
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		placeholder,
		type,
		value,
		disabled,
		onChange,
	}: {
		disabled?: boolean;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string | number;
	}) => (
		<input
			aria-label={placeholder}
			disabled={disabled}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			value={value}
		/>
	),
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

vi.mock("src/components/ui/select", () => {
	function Select({
		children,
		disabled,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		disabled?: boolean;
		onValueChange?: (value: string) => void;
		value: string;
	}) {
		return (
			<SelectContext.Provider value={{ disabled, onValueChange, value }}>
				<div>{children}</div>
			</SelectContext.Provider>
		);
	}

	function SelectContent({ children }: { children: ReactNode }) {
		return <div>{children}</div>;
	}

	function SelectItem({
		children,
		value,
	}: {
		children: ReactNode;
		value: string;
	}) {
		const context = useContext(SelectContext);

		return (
			<button
				disabled={context?.disabled}
				onClick={() => context?.onValueChange?.(value)}
				type="button"
			>
				{children}
			</button>
		);
	}

	function SelectTrigger({ children }: { children: ReactNode }) {
		const context = useContext(SelectContext);

		return (
			<button disabled={context?.disabled} type="button">
				{children}
			</button>
		);
	}

	function SelectValue() {
		const context = useContext(SelectContext);

		return <span>{context?.value}</span>;
	}

	return {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger,
		SelectValue,
	};
});

vi.mock("src/components/ui/table", () => ({
	Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
	TableBody: ({ children }: { children: ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
	TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
	TableHeader: ({ children }: { children: ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

vi.mock("src/hooks/use-role", () => ({
	useIsAdmin: () => usersRouteMocks.isAdmin,
}));

vi.mock("src/lib/admin-route", () => ({
	requireAdminBeforeLoad: vi.fn(),
}));

vi.mock("src/server/oidc-providers", () => ({
	createOidcProviderFn: (...args: unknown[]) =>
		usersRouteMocks.createOidcProviderFn(...args),
	deleteOidcProviderFn: (...args: unknown[]) =>
		usersRouteMocks.deleteOidcProviderFn(...args),
	listOidcProvidersFn: (...args: unknown[]) =>
		usersRouteMocks.listOidcProvidersFn(...args),
	updateOidcProviderFn: (...args: unknown[]) =>
		usersRouteMocks.updateOidcProviderFn(...args),
}));

vi.mock("src/server/setup", () => ({
	getRegistrationStatusFn: (...args: unknown[]) =>
		usersRouteMocks.getRegistrationStatusFn(...args),
}));

vi.mock("src/server/users", () => ({
	createUserFn: (...args: unknown[]) => usersRouteMocks.createUserFn(...args),
	deleteUserFn: (...args: unknown[]) => usersRouteMocks.deleteUserFn(...args),
	getDefaultRoleFn: (...args: unknown[]) =>
		usersRouteMocks.getDefaultRoleFn(...args),
	listUsersFn: (...args: unknown[]) => usersRouteMocks.listUsersFn(...args),
	setUserRoleFn: (...args: unknown[]) => usersRouteMocks.setUserRoleFn(...args),
	updateDefaultRoleFn: (...args: unknown[]) =>
		usersRouteMocks.updateDefaultRoleFn(...args),
}));

import { Route } from "./users";

function createLoaderData(overrides: Partial<LoaderData> = {}): LoaderData {
	return {
		defaultRole: { defaultRole: "viewer" },
		oidcProviders: [],
		registrationStatus: { registrationDisabled: true },
		users: [
			{
				authMethod: "credential",
				createdAt: new Date("2025-01-02T00:00:00Z"),
				email: "alice@example.com",
				id: "user-1",
				image: null,
				lastLogin: null,
				name: "Alice",
				role: "viewer",
			},
		],
		...overrides,
	};
}

function renderRoute(loaderData: LoaderData) {
	const route = Route as unknown as {
		component: () => JSX.Element;
		useLoaderData: () => LoaderData;
	};
	route.useLoaderData = () => loaderData;

	return renderWithProviders(<route.component />);
}

describe("users route", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		usersRouteMocks.isAdmin = false;
		usersRouteMocks.createOidcProviderFn.mockResolvedValue(undefined);
		usersRouteMocks.createUserFn.mockResolvedValue(undefined);
		usersRouteMocks.deleteOidcProviderFn.mockResolvedValue(undefined);
		usersRouteMocks.deleteUserFn.mockResolvedValue(undefined);
		usersRouteMocks.getDefaultRoleFn.mockResolvedValue({
			defaultRole: "viewer",
		});
		usersRouteMocks.getRegistrationStatusFn.mockResolvedValue({
			registrationDisabled: true,
		});
		usersRouteMocks.listOidcProvidersFn.mockResolvedValue([]);
		usersRouteMocks.listUsersFn.mockResolvedValue([]);
		usersRouteMocks.setUserRoleFn.mockResolvedValue(undefined);
		usersRouteMocks.updateDefaultRoleFn.mockResolvedValue(undefined);
		usersRouteMocks.updateOidcProviderFn.mockResolvedValue(undefined);
	});

	it("loads the route data from the backing server functions", async () => {
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

		usersRouteMocks.listUsersFn.mockResolvedValueOnce([{ id: "1" }]);
		usersRouteMocks.getDefaultRoleFn.mockResolvedValueOnce({
			defaultRole: "requester",
		});
		usersRouteMocks.listOidcProvidersFn.mockResolvedValueOnce([{ id: "p1" }]);
		usersRouteMocks.getRegistrationStatusFn.mockResolvedValueOnce({
			registrationDisabled: false,
		});

		await expect(
			route.loader({
				context: {
					queryClient: {
						ensureQueryData,
					},
				},
			}),
		).resolves.toEqual({
			defaultRole: { defaultRole: "requester" },
			oidcProviders: [{ id: "p1" }],
			registrationStatus: { registrationDisabled: false },
			users: [{ id: "1" }],
		});

		expect(usersRouteMocks.listUsersFn).toHaveBeenCalledTimes(1);
		expect(usersRouteMocks.getDefaultRoleFn).toHaveBeenCalledTimes(1);
		expect(usersRouteMocks.listOidcProvidersFn).toHaveBeenCalledTimes(1);
		expect(usersRouteMocks.getRegistrationStatusFn).toHaveBeenCalledTimes(1);
	});

	it("renders the non-admin view with read-only roles and empty provider state", async () => {
		usersRouteMocks.isAdmin = false;

		await renderRoute(
			createLoaderData({
				oidcProviders: [],
				registrationStatus: { registrationDisabled: true },
			}),
		);

		await expect
			.element(page.getByRole("heading", { name: "Users", level: 1 }))
			.toBeInTheDocument();
		await expect.element(page.getByText("Disabled")).toBeInTheDocument();
		await expect
			.element(
				page.getByRole("button", { name: "viewer", exact: true }).first(),
			)
			.toBeDisabled();
		await expect
			.element(page.getByText("No OIDC providers configured."))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Add User" }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole("button", { name: "Add Provider" }))
			.not.toBeInTheDocument();
	});

	it("handles admin updates, creation, and deletion flows", async () => {
		usersRouteMocks.isAdmin = true;

		await renderRoute(
			createLoaderData({
				defaultRole: { defaultRole: "viewer" },
				oidcProviders: [
					{
						clientId: "client-1",
						clientSecret: "secret-1",
						createdAt: new Date("2025-01-03T00:00:00Z"),
						displayName: "Authentik",
						discoveryUrl:
							"https://auth.example.com/.well-known/openid-configuration",
						enabled: true,
						id: "provider-1",
						providerId: "authentik",
						scopes: ["openid", "profile"],
						trusted: false,
					},
				],
			}),
		);

		// Find "Requester" button within Registration section
		const registrationHeading = page.getByRole("heading", {
			name: "Registration",
		});
		const registrationSection = page.elementLocator(
			(await registrationHeading.element()).closest("section") as HTMLElement,
		);
		await registrationSection
			.getByRole("button", { name: "Requester" })
			.click();
		await expect
			.poll(() => usersRouteMocks.updateDefaultRoleFn)
			.toHaveBeenCalledWith({
				data: { role: "requester" },
			});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith(
			"Default role updated",
		);

		// Find Alice's row by locating the td whose text is exactly "Alice"
		const aliceTd = Array.from(document.querySelectorAll("td")).find(
			(td) => td.textContent?.trim() === "Alice",
		) as HTMLElement;
		const aliceRow = page.elementLocator(aliceTd.closest("tr") as HTMLElement);
		await aliceRow.getByRole("button", { name: "Admin" }).click();
		expect(usersRouteMocks.setUserRoleFn).toHaveBeenCalledWith({
			data: { role: "admin", userId: "user-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("Role updated");

		await aliceRow.getByRole("button", { name: "Trash" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();
		expect(usersRouteMocks.deleteUserFn).toHaveBeenCalledWith({
			data: { userId: "user-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("User deleted");

		await page.getByRole("button", { name: /Add User/ }).click();
		await userEvent.type(page.getByLabelText("User name"), "New User");
		await userEvent.type(
			page.getByLabelText("user@example.com"),
			"new@example.com",
		);
		await userEvent.type(
			page.getByLabelText("Minimum 8 characters"),
			"supersecret",
		);
		// "Requester" buttons: [Registration, Dialog, Alice's row] — pick index 1 for Dialog
		await page.getByRole("button", { name: "Requester" }).nth(1).click();
		await page.getByRole("button", { name: "Create User" }).click();
		expect(usersRouteMocks.createUserFn).toHaveBeenCalledWith({
			data: {
				email: "new@example.com",
				name: "New User",
				password: "supersecret",
				role: "requester",
			},
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("User created");

		const authentikTd = Array.from(document.querySelectorAll("td")).find(
			(td) => td.textContent?.trim() === "Authentik",
		) as HTMLElement;
		const providerRow = page.elementLocator(
			authentikTd.closest("tr") as HTMLElement,
		);
		const providerCheckboxes = providerRow.getByRole("checkbox");
		await providerCheckboxes.first().click();
		await providerCheckboxes.nth(1).click();
		expect(usersRouteMocks.updateOidcProviderFn).toHaveBeenCalledWith({
			data: { id: "provider-1", trusted: true },
		});
		expect(usersRouteMocks.updateOidcProviderFn).toHaveBeenCalledWith({
			data: { enabled: false, id: "provider-1" },
		});

		await providerRow.getByRole("button", { name: "Trash" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();
		expect(usersRouteMocks.deleteOidcProviderFn).toHaveBeenCalledWith({
			data: { id: "provider-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith(
			"Provider deleted. Restart required.",
		);

		expect(usersRouteMocks.invalidate).toHaveBeenCalled();
	});

	it("surfaces toast errors for failed admin actions", async () => {
		usersRouteMocks.isAdmin = true;
		usersRouteMocks.updateDefaultRoleFn.mockRejectedValueOnce(
			new Error("default role failed"),
		);
		usersRouteMocks.setUserRoleFn.mockRejectedValueOnce(
			new Error("role update failed"),
		);
		usersRouteMocks.deleteUserFn.mockRejectedValueOnce(
			new Error("delete user failed"),
		);
		usersRouteMocks.createUserFn.mockRejectedValueOnce(
			new Error("create user failed"),
		);
		usersRouteMocks.updateOidcProviderFn.mockRejectedValue(
			new Error("provider update failed"),
		);
		usersRouteMocks.deleteOidcProviderFn.mockRejectedValueOnce(
			new Error("provider delete failed"),
		);

		await renderRoute(
			createLoaderData({
				oidcProviders: [
					{
						clientId: "client-1",
						clientSecret: "secret-1",
						createdAt: new Date("2025-01-03T00:00:00Z"),
						displayName: "Authentik",
						discoveryUrl:
							"https://auth.example.com/.well-known/openid-configuration",
						enabled: true,
						id: "provider-1",
						providerId: "authentik",
						scopes: ["openid", "profile"],
						trusted: false,
					},
				],
			}),
		);

		const registrationHeading = page.getByRole("heading", {
			name: "Registration",
		});
		const registrationSection = page.elementLocator(
			(await registrationHeading.element()).closest("section") as HTMLElement,
		);
		await registrationSection
			.getByRole("button", { name: "Requester" })
			.click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("Failed to update default role");

		const aliceTd2 = Array.from(document.querySelectorAll("td")).find(
			(td) => td.textContent?.trim() === "Alice",
		) as HTMLElement;
		const aliceRow = page.elementLocator(aliceTd2.closest("tr") as HTMLElement);
		await aliceRow.getByRole("button", { name: "Admin" }).click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("role update failed");

		await aliceRow.getByRole("button", { name: "Trash" }).click();
		await page.getByRole("button", { name: "Confirm" }).click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("delete user failed");
		await page.getByRole("button", { name: "Cancel" }).click();

		await page.getByRole("button", { name: /Add User/ }).click();
		await userEvent.type(page.getByLabelText("User name"), "New User");
		await userEvent.type(
			page.getByLabelText("user@example.com"),
			"new@example.com",
		);
		await userEvent.type(
			page.getByLabelText("Minimum 8 characters"),
			"supersecret",
		);
		await page.getByRole("button", { name: "Create User" }).click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("create user failed");

		const authentikTd2 = Array.from(document.querySelectorAll("td")).find(
			(td) => td.textContent?.trim() === "Authentik",
		) as HTMLElement;
		const providerRow = page.elementLocator(
			authentikTd2.closest("tr") as HTMLElement,
		);
		const providerCheckboxes = providerRow.getByRole("checkbox");
		await providerCheckboxes.first().click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("Failed to update provider");

		await providerCheckboxes.nth(1).click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("Failed to update provider");

		await providerRow.getByRole("button", { name: "Trash" }).click();
		const confirmButtons = page.getByRole("button", { name: "Confirm" });
		await confirmButtons.last().click();
		await expect
			.poll(() => usersRouteMocks.toast.error)
			.toHaveBeenCalledWith("Failed to delete provider");
	});
});
