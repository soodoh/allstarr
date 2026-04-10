import { renderWithProviders } from "src/test/render";
import { describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

describe("Tabs", () => {
	it("renders the default horizontal stack with public slots", async () => {
		await renderWithProviders(
			<Tabs defaultValue="account">
				<TabsList className="custom-list">
					<TabsTrigger value="account">Account</TabsTrigger>
					<TabsTrigger value="security">Security</TabsTrigger>
				</TabsList>
				<TabsContent className="custom-content" value="account">
					Account details
				</TabsContent>
			</Tabs>,
		);

		expect(document.body.querySelector('[data-slot="tabs"]')).toHaveAttribute(
			"data-orientation",
			"horizontal",
		);
		expect(document.body.querySelector('[data-slot="tabs"]')).toHaveClass(
			"group/tabs",
			"flex",
			"gap-2",
			"data-[orientation=horizontal]:flex-col",
		);
		expect(
			document.body.querySelector('[data-slot="tabs-list"]'),
		).toHaveAttribute("data-variant", "default");
		expect(document.body.querySelector('[data-slot="tabs-list"]')).toHaveClass(
			"custom-list",
			"bg-muted",
		);
		expect(
			document.body.querySelector('[data-slot="tabs-trigger"]'),
		).toHaveTextContent("Account");
		expect(
			document.body.querySelector('[data-slot="tabs-content"]'),
		).toHaveClass("custom-content", "flex-1", "outline-none");
	});

	it("applies vertical orientation and line variant classes", async () => {
		await renderWithProviders(
			<Tabs orientation="vertical" defaultValue="security">
				<TabsList variant="line">
					<TabsTrigger value="account">Account</TabsTrigger>
					<TabsTrigger value="security">Security</TabsTrigger>
				</TabsList>
				<TabsContent value="security">Security details</TabsContent>
			</Tabs>,
		);

		expect(document.body.querySelector('[data-slot="tabs"]')).toHaveAttribute(
			"data-orientation",
			"vertical",
		);
		expect(
			document.body.querySelector('[data-slot="tabs-list"]'),
		).toHaveAttribute("data-variant", "line");
		expect(document.body.querySelector('[data-slot="tabs-list"]')).toHaveClass(
			"gap-1",
			"bg-transparent",
		);
		expect(
			document.body.querySelector('[data-slot="tabs-trigger"]'),
		).toHaveTextContent("Account");
		expect(
			document.body.querySelector('[data-slot="tabs-content"]'),
		).toHaveTextContent("Security details");
	});
});
