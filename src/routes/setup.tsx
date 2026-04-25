import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Separator from "src/components/ui/separator";
import { signIn, signUp } from "src/lib/auth-client";
import { getRegistrationStatusFn, hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/setup")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (hasUsers) {
			throw redirect({ to: "/login" });
		}
	},
	loader: async () => {
		return getRegistrationStatusFn();
	},
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const { emailPasswordRegistrationDisabled, oidcProviders } =
		Route.useLoaderData();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await signUp.email({ name, email, password });
			if (result.error) {
				toast.error(result.error.message || "Failed to create account");
			} else {
				toast.success("Admin account created!");
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Failed to create account");
		} finally {
			setLoading(false);
		}
	};

	const handleOidcSetup = async (providerId: string) => {
		try {
			await signIn.oauth2({
				providerId,
				callbackURL: "/",
			});
		} catch {
			toast.error("Failed to continue with provider");
		}
	};

	const hasOidcProviders = oidcProviders.length > 0;
	const hasAccountCreationMethod =
		!emailPasswordRegistrationDisabled || hasOidcProviders;

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">
						Welcome to Allstarr
					</CardTitle>
					<CardDescription>
						Create your administrator account to get started.
					</CardDescription>
				</CardHeader>
				{hasAccountCreationMethod ? (
					<CardContent className="space-y-4">
						{!emailPasswordRegistrationDisabled && (
							<form onSubmit={handleSubmit} className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										type="text"
										placeholder="Your name"
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="email">Email</Label>
									<Input
										id="email"
										type="email"
										placeholder="admin@example.com"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="password">Password</Label>
									<Input
										id="password"
										type="password"
										placeholder="Password (min 8 characters)"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
										minLength={8}
									/>
								</div>
								<Button type="submit" className="w-full" disabled={loading}>
									{loading ? "Creating account..." : "Create Admin Account"}
								</Button>
							</form>
						)}

						{!emailPasswordRegistrationDisabled && hasOidcProviders && (
							<div className="relative">
								<Separator />
								<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
									or
								</span>
							</div>
						)}

						{hasOidcProviders && (
							<div className="flex flex-col gap-2">
								{oidcProviders.map(
									(provider: (typeof oidcProviders)[number]) => (
										<Button
											key={provider.providerId}
											type="button"
											variant="outline"
											className="w-full"
											onClick={() => handleOidcSetup(provider.providerId)}
										>
											Continue with {provider.displayName}
										</Button>
									),
								)}
							</div>
						)}
					</CardContent>
				) : (
					<CardContent>
						<p className="text-center text-sm text-muted-foreground">
							No account creation method is configured.
						</p>
					</CardContent>
				)}
			</Card>
		</div>
	);
}
