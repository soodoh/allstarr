import type { CSSProperties, ReactNode } from "react";
import type { ToasterProps } from "sonner";
import { render } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const sonnerMocks = {
	receivedProps: undefined as ToasterProps | undefined,
	theme: undefined as string | undefined,
};

vi.mock("next-themes", () => ({
	useTheme: () => ({
		theme: sonnerMocks.theme,
	}),
}));

vi.mock("sonner", () => ({
	Toaster: (props: ToasterProps) => {
		sonnerMocks.receivedProps = props;

		return <div data-testid="sonner-mock" />;
	},
}));

import Toaster from "./sonner";

describe("Toaster", () => {
	afterEach(() => {
		sonnerMocks.receivedProps = undefined;
		sonnerMocks.theme = undefined;
	});

	it("forwards the resolved theme, icons, and styles to Sonner", async () => {
		sonnerMocks.theme = undefined;

		await render(<Toaster />);

		await expect.element(page.getByTestId("sonner-mock")).toBeInTheDocument();
		expect(sonnerMocks.receivedProps).toMatchObject({
			position: "bottom-left",
			theme: "system",
			className: "toaster group",
		});

		const icons = sonnerMocks.receivedProps?.icons as
			| Record<string, ReactNode>
			| undefined;
		expect(
			(icons?.success as { props?: { className?: string } })?.props?.className,
		).toBe("size-4");
		expect(
			(icons?.loading as { props?: { className?: string } })?.props?.className,
		).toBe("size-4 animate-spin");

		const style = sonnerMocks.receivedProps?.style as CSSProperties | undefined;
		expect(style).toMatchObject({
			"--normal-bg": "var(--color-popover)",
			"--border-radius": "var(--radius)",
		});
	});
});
