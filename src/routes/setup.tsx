import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
import { signUp } from "src/lib/auth-client";
import { hasUsersFn } from "src/server/setup";

export const Route = createFileRoute("/setup")({
	beforeLoad: async () => {
		const { hasUsers } = await hasUsersFn();
		if (hasUsers) {
			throw redirect({ to: "/login" });
		}
	},
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
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
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
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
					</CardContent>
					<CardFooter className="mt-6">
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Creating account..." : "Create Admin Account"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	);
}
