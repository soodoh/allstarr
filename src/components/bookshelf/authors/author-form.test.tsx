import { createContext, type ReactNode, useContext } from "react";
import { renderWithProviders } from "src/test/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const authorFormMocks = vi.hoisted(() => ({
	profileCheckboxGroup: vi.fn(),
}));

type SelectContextValue = {
	onValueChange?: (value: string) => void;
	value: string;
};

const SelectContext = createContext<SelectContextValue | null>(null);

vi.mock("src/components/shared/profile-checkbox-group", () => ({
	default: ({
		onToggle,
		profiles,
		selectedIds,
	}: {
		onToggle: (id: number) => void;
		profiles: Array<{ id: number; name: string }>;
		selectedIds: number[];
	}) => {
		authorFormMocks.profileCheckboxGroup({ profiles, selectedIds });

		return (
			<div>
				{profiles.map((profile) => (
					<button
						key={profile.id}
						type="button"
						onClick={() => onToggle(profile.id)}
					>
						{profile.name}
					</button>
				))}
			</div>
		);
	},
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
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value: string;
	}) {
		return (
			<SelectContext.Provider value={{ onValueChange, value }}>
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
			<button type="button" onClick={() => context?.onValueChange?.(value)}>
				{children}
			</button>
		);
	}

	function SelectTrigger({ children }: { children: ReactNode }) {
		return <button type="button">{children}</button>;
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

import AuthorForm from "./author-form";

describe("AuthorForm", () => {
	beforeEach(() => {
		authorFormMocks.profileCheckboxGroup.mockClear();
	});

	it("submits selected profiles and monitoring mode", async () => {
		const onSubmit = vi.fn();

		const { container } = await renderWithProviders(
			<AuthorForm
				downloadProfiles={[
					{ id: 1, name: "Books", icon: "book" },
					{ id: 2, name: "Audio", icon: "headphones" },
				]}
				initialValues={{
					downloadProfileIds: [1],
					monitorNewBooks: "new",
				}}
				onSubmit={onSubmit}
			/>,
		);

		expect(authorFormMocks.profileCheckboxGroup).toHaveBeenCalledWith({
			profiles: [
				{ id: 1, name: "Books", icon: "book" },
				{ id: 2, name: "Audio", icon: "headphones" },
			],
			selectedIds: [1],
		});

		await page.getByRole("button", { name: "Audio" }).click();
		await page.getByRole("button", { name: "None" }).click();
		await page.getByRole("button", { name: "Save" }).click();

		expect(onSubmit).toHaveBeenCalledWith({
			downloadProfileIds: [1, 2],
			monitorNewBooks: "none",
		});
	});

	it("supports deselecting a profile and rendering cancel/loading states", async () => {
		const onCancel = vi.fn();

		await renderWithProviders(
			<AuthorForm
				downloadProfiles={[{ id: 5, name: "Profile", icon: "book" }]}
				initialValues={{
					downloadProfileIds: [5],
					monitorNewBooks: "all",
				}}
				loading
				onCancel={onCancel}
				onSubmit={vi.fn()}
				submitLabel="Create"
			/>,
		);

		await page.getByRole("button", { name: "Profile" }).click();
		await page.getByRole("button", { name: "Cancel" }).click();

		expect(onCancel).toHaveBeenCalledTimes(1);
		await expect
			.element(page.getByRole("button", { name: "Saving..." }))
			.toBeDisabled();
		expect(authorFormMocks.profileCheckboxGroup).toHaveBeenLastCalledWith({
			profiles: [{ id: 5, name: "Profile", icon: "book" }],
			selectedIds: [],
		});
	});
});
