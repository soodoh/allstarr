import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import PageHeader from "src/components/shared/page-header";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "src/components/ui/dialog";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "src/components/ui/table";
import { useIsAdmin } from "src/hooks/use-role";
import { requireAdminBeforeLoad } from "src/lib/admin-route";
import {
	createOidcProviderFn,
	deleteOidcProviderFn,
	listOidcProvidersFn,
	updateOidcProviderFn,
} from "src/server/oidc-providers";
import { getRegistrationStatusFn } from "src/server/setup";
import {
	createUserFn,
	deleteUserFn,
	getDefaultRoleFn,
	listUsersFn,
	setUserRoleFn,
	updateDefaultRoleFn,
} from "src/server/users";

export const Route = createFileRoute("/_authed/settings/users")({
	beforeLoad: requireAdminBeforeLoad,
	loader: async () => {
		const [users, defaultRole, oidcProviders, registrationStatus] =
			await Promise.all([
				listUsersFn(),
				getDefaultRoleFn(),
				listOidcProvidersFn(),
				getRegistrationStatusFn(),
			]);
		return { users, defaultRole, oidcProviders, registrationStatus };
	},
	component: UsersSettingsPage,
});

function UsersSettingsPage() {
	const { users, defaultRole, oidcProviders, registrationStatus } =
		Route.useLoaderData();
	const isAdmin = useIsAdmin();

	return (
		<div className="space-y-6">
			<PageHeader
				title="Users"
				description="Manage users, roles, and authentication providers."
			/>

			<RegistrationSettingsSection
				defaultRole={defaultRole.defaultRole}
				registrationDisabled={registrationStatus.registrationDisabled}
				isAdmin={isAdmin}
			/>

			<UsersTableSection users={users} isAdmin={isAdmin} />

			<OidcProvidersSection providers={oidcProviders} isAdmin={isAdmin} />
		</div>
	);
}

// ─── Registration Settings ──────────────────────────────────────────────────

function RegistrationSettingsSection({
	defaultRole,
	registrationDisabled,
	isAdmin,
}: {
	defaultRole: string;
	registrationDisabled: boolean;
	isAdmin: boolean;
}) {
	const router = useRouter();

	const handleDefaultRoleChange = async (role: string) => {
		try {
			await updateDefaultRoleFn({
				data: { role: role as "viewer" | "requester" },
			});
			toast.success("Default role updated");
			router.invalidate();
		} catch {
			toast.error("Failed to update default role");
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Registration</CardTitle>
				<CardDescription>
					Control how new users can register for accounts.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<Label>Account Registration</Label>
						<p className="text-sm text-muted-foreground">
							Controlled by the DISABLE_REGISTRATION environment variable.
						</p>
					</div>
					<Badge variant={registrationDisabled ? "destructive" : "default"}>
						{registrationDisabled ? "Disabled" : "Enabled"}
					</Badge>
				</div>
				<div className="space-y-2">
					<Label>Default Role for New Users</Label>
					<Select
						value={defaultRole}
						onValueChange={handleDefaultRoleChange}
						disabled={!isAdmin}
					>
						<SelectTrigger className="w-48">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="viewer">Viewer</SelectItem>
							<SelectItem value="requester">Requester</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-sm text-muted-foreground">
						Role assigned to newly registered users.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Users Table ────────────────────────────────────────────────────────────

type UserRow = {
	id: string;
	name: string;
	email: string;
	role: string | null;
	image: string | null;
	createdAt: Date;
	lastLogin: Date | null;
	authMethod: string;
};

function UsersTableSection({
	users,
	isAdmin,
}: {
	users: UserRow[];
	isAdmin: boolean;
}) {
	const router = useRouter();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteUserId, setDeleteUserId] = useState<string | null>(null);

	const handleRoleChange = async (userId: string, role: string) => {
		try {
			await setUserRoleFn({
				data: { userId, role: role as "admin" | "viewer" | "requester" },
			});
			toast.success("Role updated");
			router.invalidate();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to update role");
		}
	};

	const handleDelete = async () => {
		if (!deleteUserId) return;
		try {
			await deleteUserFn({ data: { userId: deleteUserId } });
			toast.success("User deleted");
			setDeleteUserId(null);
			router.invalidate();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to delete user");
		}
	};

	const formatDate = (date: Date | null) => {
		if (!date) return "Never";
		return new Date(date).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Users</CardTitle>
					<CardDescription>
						Manage user accounts and their roles.
					</CardDescription>
				</div>
				{isAdmin && (
					<CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
				)}
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Auth Method</TableHead>
							<TableHead>Last Login</TableHead>
							<TableHead>Created</TableHead>
							{isAdmin && <TableHead className="w-12" />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.map((u) => (
							<TableRow key={u.id}>
								<TableCell>{u.name}</TableCell>
								<TableCell>{u.email}</TableCell>
								<TableCell>
									{isAdmin ? (
										<Select
											value={u.role || "viewer"}
											onValueChange={(role) => handleRoleChange(u.id, role)}
										>
											<SelectTrigger className="w-32">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="viewer">Viewer</SelectItem>
												<SelectItem value="requester">Requester</SelectItem>
											</SelectContent>
										</Select>
									) : (
										<Badge variant="outline">{u.role || "viewer"}</Badge>
									)}
								</TableCell>
								<TableCell>
									<Badge variant="secondary">
										{u.authMethod === "credential" ? "Email" : u.authMethod}
									</Badge>
								</TableCell>
								<TableCell>{formatDate(u.lastLogin)}</TableCell>
								<TableCell>{formatDate(u.createdAt)}</TableCell>
								{isAdmin && (
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setDeleteUserId(u.id)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>

			<ConfirmDialog
				open={!!deleteUserId}
				onOpenChange={(open) => !open && setDeleteUserId(null)}
				title="Delete User"
				description="Are you sure you want to delete this user? This action cannot be undone."
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</Card>
	);
}

// ─── Create User Dialog ─────────────────────────────────────────────────────

function CreateUserDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [role, setRole] = useState("viewer");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		setLoading(true);
		try {
			await createUserFn({
				data: {
					name,
					email,
					password,
					role: role as "admin" | "viewer" | "requester",
				},
			});
			toast.success("User created");
			onOpenChange(false);
			setName("");
			setEmail("");
			setPassword("");
			setRole("viewer");
			router.invalidate();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to create user");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" />
					Add User
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create User</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="User name"
						/>
					</div>
					<div className="space-y-2">
						<Label>Email</Label>
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="user@example.com"
						/>
					</div>
					<div className="space-y-2">
						<Label>Password</Label>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="Minimum 8 characters"
						/>
					</div>
					<div className="space-y-2">
						<Label>Role</Label>
						<Select value={role} onValueChange={setRole}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="viewer">Viewer</SelectItem>
								<SelectItem value="requester">Requester</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading}>
						{loading ? "Creating..." : "Create User"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── OIDC Providers Section ─────────────────────────────────────────────────

type OidcProvider = {
	id: string;
	providerId: string;
	displayName: string;
	clientId: string;
	clientSecret: string;
	discoveryUrl: string;
	scopes: string[];
	trusted: boolean;
	enabled: boolean;
	createdAt: Date;
};

function OidcProvidersSection({
	providers,
	isAdmin,
}: {
	providers: OidcProvider[];
	isAdmin: boolean;
}) {
	const router = useRouter();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const handleToggleEnabled = async (id: string, enabled: boolean) => {
		try {
			await updateOidcProviderFn({ data: { id, enabled } });
			toast.success(
				`Provider ${enabled ? "enabled" : "disabled"}. Restart required.`,
			);
			router.invalidate();
		} catch {
			toast.error("Failed to update provider");
		}
	};

	const handleToggleTrusted = async (id: string, trusted: boolean) => {
		try {
			await updateOidcProviderFn({ data: { id, trusted } });
			toast.success("Provider trust updated. Restart required.");
			router.invalidate();
		} catch {
			toast.error("Failed to update provider");
		}
	};

	const handleDelete = async () => {
		if (!deleteId) return;
		try {
			await deleteOidcProviderFn({ data: { id: deleteId } });
			toast.success("Provider deleted. Restart required.");
			setDeleteId(null);
			router.invalidate();
		} catch {
			toast.error("Failed to delete provider");
		}
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>OIDC Providers</CardTitle>
					<CardDescription>
						Configure single sign-on providers. Changes require a server restart
						to take effect.
					</CardDescription>
				</div>
				{isAdmin && (
					<CreateOidcProviderDialog
						open={createOpen}
						onOpenChange={setCreateOpen}
					/>
				)}
			</CardHeader>
			<CardContent>
				{providers.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No OIDC providers configured.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Provider ID</TableHead>
								<TableHead>Discovery URL</TableHead>
								<TableHead>Trusted</TableHead>
								<TableHead>Enabled</TableHead>
								{isAdmin && <TableHead className="w-12" />}
							</TableRow>
						</TableHeader>
						<TableBody>
							{providers.map((p) => (
								<TableRow key={p.id}>
									<TableCell>{p.displayName}</TableCell>
									<TableCell>
										<code className="text-xs">{p.providerId}</code>
									</TableCell>
									<TableCell className="max-w-48 truncate text-sm">
										{p.discoveryUrl}
									</TableCell>
									<TableCell>
										<input
											type="checkbox"
											checked={p.trusted}
											onChange={(e) =>
												handleToggleTrusted(p.id, e.target.checked)
											}
											disabled={!isAdmin}
										/>
									</TableCell>
									<TableCell>
										<input
											type="checkbox"
											checked={p.enabled}
											onChange={(e) =>
												handleToggleEnabled(p.id, e.target.checked)
											}
											disabled={!isAdmin}
										/>
									</TableCell>
									{isAdmin && (
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => setDeleteId(p.id)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>

			<ConfirmDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
				title="Delete OIDC Provider"
				description="Are you sure? This requires a server restart to take effect."
				onConfirm={handleDelete}
				variant="destructive"
			/>
		</Card>
	);
}

// ─── Create OIDC Provider Dialog ────────────────────────────────────────────

function CreateOidcProviderDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [providerId, setProviderId] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [clientId, setClientId] = useState("");
	const [clientSecret, setClientSecret] = useState("");
	const [discoveryUrl, setDiscoveryUrl] = useState("");
	const [trusted, setTrusted] = useState(false);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async () => {
		setLoading(true);
		try {
			await createOidcProviderFn({
				data: {
					providerId,
					displayName,
					clientId,
					clientSecret,
					discoveryUrl,
					trusted,
				},
			});
			toast.success("Provider created. Restart required.");
			onOpenChange(false);
			setProviderId("");
			setDisplayName("");
			setClientId("");
			setClientSecret("");
			setDiscoveryUrl("");
			setTrusted(false);
			router.invalidate();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Failed to create provider");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="mr-2 h-4 w-4" />
					Add Provider
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add OIDC Provider</DialogTitle>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Display Name</Label>
						<Input
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="e.g. Authentik"
						/>
					</div>
					<div className="space-y-2">
						<Label>Provider ID</Label>
						<Input
							value={providerId}
							onChange={(e) => setProviderId(e.target.value)}
							placeholder="e.g. authentik (lowercase, hyphens)"
						/>
						<p className="text-xs text-muted-foreground">
							Used in callback URLs. Must be lowercase alphanumeric with
							hyphens.
						</p>
					</div>
					<div className="space-y-2">
						<Label>Client ID</Label>
						<Input
							value={clientId}
							onChange={(e) => setClientId(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Client Secret</Label>
						<Input
							type="password"
							value={clientSecret}
							onChange={(e) => setClientSecret(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label>Discovery URL</Label>
						<Input
							value={discoveryUrl}
							onChange={(e) => setDiscoveryUrl(e.target.value)}
							placeholder="https://auth.example.com/.well-known/openid-configuration"
						/>
					</div>
					<div className="flex items-center gap-2">
						<input
							type="checkbox"
							id="trusted"
							checked={trusted}
							onChange={(e) => setTrusted(e.target.checked)}
						/>
						<Label htmlFor="trusted">
							Trusted provider (can create accounts even when registration is
							disabled)
						</Label>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={loading}>
						{loading ? "Creating..." : "Add Provider"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
