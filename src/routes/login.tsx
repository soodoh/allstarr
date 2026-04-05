import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "src/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "src/components/ui/card";
import Input from "src/components/ui/input";
import Label from "src/components/ui/label";
import Separator from "src/components/ui/separator";
import { signIn } from "src/lib/auth-client";
import { getRegistrationStatusFn, hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (!hasUsers) {
			throw redirect({ to: "/setup" });
		}
	},
	loader: async () => {
		return getRegistrationStatusFn();
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const { registrationDisabled, oidcProviders } = Route.useLoaderData();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await signIn.email({ email, password });
			if (result.error) {
				toast.error(result.error.message || "Failed to sign in");
			} else {
				navigate({ to: "/" });
			}
		} catch {
			toast.error("Failed to sign in");
		} finally {
			setLoading(false);
		}
	};

	const handleOidcSignIn = async (providerId: string) => {
		try {
			await signIn.oauth2({
				providerId,
				callbackURL: "/",
			});
		} catch {
			toast.error("Failed to sign in with provider");
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl font-bold">Allstarr</CardTitle>
					<CardDescription>Sign in to your account</CardDescription>
				</CardHeader>
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
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
								placeholder="Password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
							/>
						</div>
					</CardContent>
					<CardFooter className="mt-6 flex flex-col gap-4">
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Signing in..." : "Sign In"}
						</Button>

						{oidcProviders.length > 0 && (
							<>
								<div className="relative w-full">
									<Separator />
									<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
										or
									</span>
								</div>
								<div className="flex w-full flex-col gap-2">
									{oidcProviders.map((provider) => (
										<Button
											key={provider.providerId}
											type="button"
											variant="outline"
											className="w-full"
											onClick={() => handleOidcSignIn(provider.providerId)}
										>
											Sign in with {provider.displayName}
										</Button>
									))}
								</div>
							</>
						)}

						{!registrationDisabled && (
							<p className="text-sm text-muted-foreground">
								Don&apos;t have an account?{" "}
								<Link to="/register" className="text-primary underline">
									Register
								</Link>
							</p>
						)}
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
