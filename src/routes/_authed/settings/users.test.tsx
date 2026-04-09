import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

	it("renders the non-admin view with read-only roles and empty provider state", () => {
		usersRouteMocks.isAdmin = false;

		const view = renderRoute(
			createLoaderData({
				oidcProviders: [],
				registrationStatus: { registrationDisabled: true },
			}),
		);

		expect(
			view.getByRole("heading", { name: "Users", level: 1 }),
		).toBeInTheDocument();
		expect(view.getByText("Disabled")).toBeInTheDocument();
		expect(view.getByRole("button", { name: "viewer" })).toBeDisabled();
		expect(view.getByText("No OIDC providers configured.")).toBeInTheDocument();
		expect(
			view.queryByRole("button", { name: "Add User" }),
		).not.toBeInTheDocument();
		expect(
			view.queryByRole("button", { name: "Add Provider" }),
		).not.toBeInTheDocument();
	});

	it("handles admin updates, creation, and deletion flows", async () => {
		const user = userEvent.setup();
		usersRouteMocks.isAdmin = true;

		const view = renderRoute(
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

		const registrationCard = view
			.getByRole("heading", {
				name: "Registration",
			})
			.closest("section") as HTMLElement;
		await user.click(
			within(registrationCard).getByRole("button", { name: "Requester" }),
		);
		await expect(usersRouteMocks.updateDefaultRoleFn).toHaveBeenCalledWith({
			data: { role: "requester" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith(
			"Default role updated",
		);

		const userRow = view.getByText("Alice").closest("tr") as HTMLElement;
		await user.click(within(userRow).getByRole("button", { name: "Admin" }));
		expect(usersRouteMocks.setUserRoleFn).toHaveBeenCalledWith({
			data: { role: "admin", userId: "user-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("Role updated");

		await user.click(within(userRow).getByRole("button", { name: "Trash" }));
		await user.click(view.getByRole("button", { name: "Confirm" }));
		expect(usersRouteMocks.deleteUserFn).toHaveBeenCalledWith({
			data: { userId: "user-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("User deleted");

		await user.click(view.getByRole("button", { name: /Add User/ }));
		const createUserDialog = view
			.getByRole("heading", { name: "Create User" })
			.closest("div") as HTMLElement;
		await user.type(
			within(createUserDialog).getByPlaceholderText("User name"),
			"New User",
		);
		await user.type(
			within(createUserDialog).getByPlaceholderText("user@example.com"),
			"new@example.com",
		);
		await user.type(
			within(createUserDialog).getByPlaceholderText("Minimum 8 characters"),
			"supersecret",
		);
		await user.click(
			within(createUserDialog).getByRole("button", { name: "Requester" }),
		);
		await user.click(
			within(createUserDialog).getByRole("button", { name: "Create User" }),
		);
		expect(usersRouteMocks.createUserFn).toHaveBeenCalledWith({
			data: {
				email: "new@example.com",
				name: "New User",
				password: "supersecret",
				role: "requester",
			},
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith("User created");

		const providerRow = view
			.getByText("Authentik")
			.closest("tr") as HTMLElement;
		const providerCheckboxes = within(providerRow).getAllByRole("checkbox");
		await user.click(providerCheckboxes[0]);
		await user.click(providerCheckboxes[1]);
		expect(usersRouteMocks.updateOidcProviderFn).toHaveBeenCalledWith({
			data: { id: "provider-1", trusted: true },
		});
		expect(usersRouteMocks.updateOidcProviderFn).toHaveBeenCalledWith({
			data: { enabled: false, id: "provider-1" },
		});

		await user.click(
			within(providerRow).getByRole("button", { name: "Trash" }),
		);
		await user.click(view.getByRole("button", { name: "Confirm" }));
		expect(usersRouteMocks.deleteOidcProviderFn).toHaveBeenCalledWith({
			data: { id: "provider-1" },
		});
		expect(usersRouteMocks.toast.success).toHaveBeenCalledWith(
			"Provider deleted. Restart required.",
		);

		expect(usersRouteMocks.invalidate).toHaveBeenCalled();
	});

	it("surfaces toast errors for failed admin actions", async () => {
		const user = userEvent.setup();
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

		const view = renderRoute(
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

		const registrationCard = view
			.getByRole("heading", {
				name: "Registration",
			})
			.closest("section") as HTMLElement;
		await user.click(
			within(registrationCard).getByRole("button", { name: "Requester" }),
		);
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"Failed to update default role",
			),
		);

		const userRow = view.getByText("Alice").closest("tr") as HTMLElement;
		await user.click(within(userRow).getByRole("button", { name: "Admin" }));
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"role update failed",
			),
		);

		await user.click(within(userRow).getByRole("button", { name: "Trash" }));
		await user.click(view.getByRole("button", { name: "Confirm" }));
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"delete user failed",
			),
		);
		await user.click(view.getByRole("button", { name: "Cancel" }));

		await user.click(view.getByRole("button", { name: /Add User/ }));
		const createUserDialog = view
			.getByRole("heading", { name: "Create User" })
			.closest("div") as HTMLElement;
		await user.type(
			within(createUserDialog).getByPlaceholderText("User name"),
			"New User",
		);
		await user.type(
			within(createUserDialog).getByPlaceholderText("user@example.com"),
			"new@example.com",
		);
		await user.type(
			within(createUserDialog).getByPlaceholderText("Minimum 8 characters"),
			"supersecret",
		);
		await user.click(
			within(createUserDialog).getByRole("button", { name: "Create User" }),
		);
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"create user failed",
			),
		);

		const providerRow = view
			.getByText("Authentik")
			.closest("tr") as HTMLElement;
		const providerCheckboxes = within(providerRow).getAllByRole("checkbox");
		await user.click(providerCheckboxes[0]);
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"Failed to update provider",
			),
		);

		await user.click(providerCheckboxes[1]);
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"Failed to update provider",
			),
		);

		await user.click(
			within(providerRow).getByRole("button", { name: "Trash" }),
		);
		const confirmButtons = view.getAllByRole("button", { name: "Confirm" });
		const latestConfirmButton = confirmButtons.at(-1);
		if (!latestConfirmButton) {
			throw new Error("confirm button not found");
		}
		await user.click(latestConfirmButton);
		await waitFor(() =>
			expect(usersRouteMocks.toast.error).toHaveBeenCalledWith(
				"Failed to delete provider",
			),
		);
	});
});
