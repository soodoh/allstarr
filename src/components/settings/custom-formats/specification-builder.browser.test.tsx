import { createContext, type ReactNode, useContext } from "react";
import { renderWithProviders } from "src/test/render";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const selectContext = createContext<{
	onValueChange?: (value: string) => void;
} | null>(null);

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		type = "button",
	}: {
		children: ReactNode;
		onClick?: () => void;
		type?: "button" | "submit" | "reset";
	}) => (
		<button onClick={onClick} type={type}>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/checkbox", () => ({
	default: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={checked}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

vi.mock("src/components/ui/input", () => ({
	default: ({
		checked,
		className,
		id,
		onChange,
		placeholder,
		type = "text",
		value,
	}: {
		checked?: boolean;
		className?: string;
		id?: string;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		type?: string;
		value?: string | number;
	}) => (
		<input
			checked={checked}
			className={className}
			id={id}
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
		className,
		htmlFor,
	}: {
		children: ReactNode;
		className?: string;
		htmlFor?: string;
	}) => (
		<label className={className} htmlFor={htmlFor}>
			{children}
		</label>
	),
}));

vi.mock("src/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: ReactNode;
		onValueChange?: (value: string) => void;
		value?: string;
	}) => (
		<selectContext.Provider value={{ onValueChange }}>
			<div data-value={value}>{children}</div>
		</selectContext.Provider>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
		const ctx = useContext(selectContext);
		return (
			<button onClick={() => ctx?.onValueChange?.(value)} type="button">
				{children}
			</button>
		);
	},
	SelectLabel: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectSeparator: () => <hr />,
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span>{placeholder}</span>
	),
}));

vi.mock("src/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import SpecificationBuilder, { type Spec } from "./specification-builder";

const baseSpec = {
	name: "Release Title",
	negate: false,
	required: true,
	type: "releaseTitle",
	value: "foo",
} satisfies Spec;

describe("SpecificationBuilder", () => {
	it("renders type-specific inputs and adds a new condition", async () => {
		const onChange = vi.fn();
		const value = [
			baseSpec,
			{
				name: "Size",
				negate: false,
				required: false,
				type: "size",
				min: 100,
				max: 250,
			} satisfies Spec,
			{
				name: "Indexer Flag",
				negate: true,
				required: false,
				type: "indexerFlag",
				value: "webdl",
			} satisfies Spec,
			{
				name: "Video Source",
				negate: false,
				required: true,
				type: "videoSource",
				value: "webdl",
			} satisfies Spec,
		];

		await renderWithProviders(
			<SpecificationBuilder onChange={onChange} value={value} />,
		);

		await expect
			.element(
				page.getByText(
					"All required conditions AND at least one optional condition must match.",
				),
			)
			.toBeInTheDocument();
		expect(await page.getByPlaceholder("Regex pattern...").all()).toHaveLength(
			1,
		);
		expect(await page.getByPlaceholder("Min").all()).toHaveLength(1);
		expect(await page.getByPlaceholder("Max").all()).toHaveLength(1);
		expect(await page.getByPlaceholder("Flag value...").all()).toHaveLength(1);
		await expect
			.element(page.getByRole("button", { name: "WEB-DL" }))
			.toBeInTheDocument();

		await page.getByRole("button", { name: "Add Condition" }).click();

		expect(onChange).toHaveBeenCalledWith([
			...value,
			{
				name: "Release Title",
				negate: false,
				required: true,
				type: "releaseTitle",
				value: "",
			},
		]);
	});

	it("resets value fields when the spec type changes and toggles booleans", async () => {
		const onChange = vi.fn();

		await renderWithProviders(
			<SpecificationBuilder
				onChange={onChange}
				value={[
					{
						name: "Release Title",
						negate: false,
						required: true,
						type: "releaseTitle",
						value: "foo",
					} satisfies Spec,
				]}
			/>,
		);

		await page.getByRole("button", { name: "Size" }).click();

		expect(onChange).toHaveBeenNthCalledWith(1, [
			expect.objectContaining({
				name: "Size",
				type: "size",
				value: undefined,
				min: undefined,
				max: undefined,
				negate: false,
				required: true,
				_key: 1,
			}),
		]);
	});
});
