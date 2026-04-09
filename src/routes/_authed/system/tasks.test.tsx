import { fireEvent } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { renderWithProviders } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tasksRouteMocks = vi.hoisted(() => ({
	runTask: {
		isPending: false,
		mutate: vi.fn(),
	},
	scheduledTasksQuery: vi.fn(() => ({
		queryFn: vi.fn(),
		queryKey: ["scheduled-tasks"],
	})),
	toggleEnabled: {
		mutate: vi.fn(),
	},
	useSuspenseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useSuspenseQuery: (...args: Parameters<typeof actual.useSuspenseQuery>) =>
			tasksRouteMocks.useSuspenseQuery(...args),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/components/shared/loading-skeleton", () => ({
	TableSkeleton: () => <div data-testid="table-skeleton" />,
}));

vi.mock("src/components/shared/page-header", () => ({
	default: ({ description, title }: { description: string; title: string }) => (
		<div data-testid="page-header">
			{title}:{description}
		</div>
	),
}));

vi.mock("src/components/ui/badge", () => ({
	Badge: ({
		children,
		className,
		variant,
	}: {
		children: ReactNode;
		className?: string;
		variant?: string;
	}) => (
		<span className={className} data-variant={variant}>
			{children}
		</span>
	),
}));

vi.mock("src/components/ui/button", () => ({
	Button: ({
		children,
		className,
		disabled,
		onClick,
		type,
		variant,
	}: {
		children: ReactNode;
		className?: string;
		disabled?: boolean;
		onClick?: () => void;
		type?: "button";
		variant?: string;
	}) => (
		<button
			className={className}
			data-variant={variant}
			disabled={disabled}
			onClick={onClick}
			type={type ?? "button"}
		>
			{children}
		</button>
	),
}));

vi.mock("src/components/ui/card", () => ({
	Card: ({ children }: { children: ReactNode }) => (
		<section>{children}</section>
	),
	CardContent: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardHeader: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <div className={className}>{children}</div>,
	CardTitle: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <h2 className={className}>{children}</h2>,
}));

vi.mock("src/components/ui/switch", () => ({
	default: ({
		checked,
		onCheckedChange,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<button
			data-checked={String(checked)}
			onClick={() => onCheckedChange(!checked)}
			type="button"
		>
			switch
		</button>
	),
}));

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
	TableRow: ({
		children,
		className,
	}: {
		children: ReactNode;
		className?: string;
	}) => <tr className={className}>{children}</tr>,
}));

vi.mock("src/components/ui/tooltip", () => ({
	TooltipProvider: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("src/hooks/mutations/tasks", () => ({
	useRunTask: () => tasksRouteMocks.runTask,
	useToggleTaskEnabled: () => tasksRouteMocks.toggleEnabled,
}));

vi.mock("src/lib/queries", () => ({
	scheduledTasksQuery: () => tasksRouteMocks.scheduledTasksQuery(),
}));

import { Route } from "./tasks";

describe("system tasks route", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-04-08T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		tasksRouteMocks.runTask.isPending = false;
	});

	it("wires the loader and pending component", async () => {
		const ensureQueryData = vi.fn();
		const routeConfig = Route as unknown as {
			loader: (input: {
				context: {
					queryClient: {
						ensureQueryData: typeof ensureQueryData;
					};
				};
			}) => Promise<unknown> | unknown;
			pendingComponent: () => JSX.Element;
		};

		await routeConfig.loader({
			context: {
				queryClient: {
					ensureQueryData,
				},
			},
		});

		expect(tasksRouteMocks.scheduledTasksQuery).toHaveBeenCalledTimes(1);
		expect(ensureQueryData).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["scheduled-tasks"],
			}),
		);

		const pendingView = renderWithProviders(<routeConfig.pendingComponent />);
		expect(pendingView.getByTestId("table-skeleton")).toBeInTheDocument();
	});

	it("renders grouped tasks, formatting branches, and mutation actions", async () => {
		tasksRouteMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					enabled: true,
					group: "search",
					id: "task-running",
					interval: 30,
					isRunning: true,
					lastDuration: 500,
					lastExecution: "2025-04-08T11:59:30.000Z",
					lastMessage: null,
					lastResult: null,
					name: "RSS Sync",
					nextExecution: "2025-04-08T12:00:30.000Z",
					progress: "Scanning feeds",
				},
				{
					enabled: true,
					group: "metadata",
					id: "task-pending",
					interval: 120,
					isRunning: false,
					lastDuration: null,
					lastExecution: null,
					lastMessage: null,
					lastResult: null,
					name: "Refresh Metadata",
					nextExecution: null,
					progress: null,
				},
				{
					enabled: false,
					group: "media",
					id: "task-success",
					interval: 7200,
					isRunning: false,
					lastDuration: 2500,
					lastExecution: "2025-04-08T10:00:00.000Z",
					lastMessage: "Finished successfully",
					lastResult: "success",
					name: "Move Files",
					nextExecution: "2025-04-08T14:00:00.000Z",
					progress: null,
				},
				{
					enabled: true,
					group: "maintenance",
					id: "task-error",
					interval: 172800,
					isRunning: false,
					lastDuration: 1000,
					lastExecution: "2025-04-06T12:00:00.000Z",
					lastMessage: "Disk full",
					lastResult: "error",
					name: "Cleanup Cache",
					nextExecution: "2025-04-10T12:00:00.000Z",
					progress: null,
				},
				{
					enabled: true,
					group: "custom",
					id: "task-custom",
					interval: 3600,
					isRunning: false,
					lastDuration: 800,
					lastExecution: "2025-04-08T11:50:00.000Z",
					lastMessage: "Custom note",
					lastResult: "success",
					name: "Custom Task",
					nextExecution: "2025-04-08T12:30:00.000Z",
					progress: null,
				},
			],
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const { container, getAllByRole, getAllByText, getByText } =
			renderWithProviders(routeConfig.component());

		expect(
			getByText("Tasks:Scheduled background tasks and their execution status."),
		).toBeInTheDocument();
		expect(getByText("Search")).toBeInTheDocument();
		expect(getByText("Metadata")).toBeInTheDocument();
		expect(getByText("Media Management")).toBeInTheDocument();
		expect(getByText("Maintenance")).toBeInTheDocument();
		expect(getByText("custom")).toBeInTheDocument();

		expect(getByText("30s")).toBeInTheDocument();
		expect(getByText("2 minutes")).toBeInTheDocument();
		expect(getAllByText("2 hours").length).toBeGreaterThan(0);
		expect(getByText("2 days")).toBeInTheDocument();
		expect(getByText("1 hour")).toBeInTheDocument();

		expect(getByText("just now")).toBeInTheDocument();
		expect(getAllByText("Never").length).toBeGreaterThan(1);
		expect(getAllByText("2 hours ago").length).toBeGreaterThan(0);
		expect(getByText("2 days ago")).toBeInTheDocument();
		expect(getAllByText("in < 1 minute").length).toBeGreaterThan(0);
		expect(getByText("in 2 hours")).toBeInTheDocument();
		expect(getByText("in 48 hours")).toBeInTheDocument();
		expect(getByText("in 30 minutes")).toBeInTheDocument();

		expect(getAllByText("500ms").length).toBeGreaterThan(0);
		expect(getByText("2.5s")).toBeInTheDocument();
		expect(getByText("1.0s")).toBeInTheDocument();
		expect(getByText("800ms")).toBeInTheDocument();

		expect(getByText("Scanning feeds")).toBeInTheDocument();
		expect(getByText("Finished successfully")).toBeInTheDocument();
		expect(getByText("Disk full")).toBeInTheDocument();
		expect(getByText("Custom note")).toBeInTheDocument();

		expect(getByText("Running")).toBeInTheDocument();
		expect(getByText("Pending")).toBeInTheDocument();
		expect(getAllByText("Success").length).toBeGreaterThan(0);
		expect(getByText("Error")).toBeInTheDocument();
		expect(getAllByText("Run now").length).toBeGreaterThan(0);
		expect(container.querySelector(".opacity-50")).not.toBeNull();

		fireEvent.click(
			getAllByRole("button", { name: "switch" })[0] as HTMLElement,
		);
		expect(tasksRouteMocks.toggleEnabled.mutate).toHaveBeenCalledWith({
			enabled: false,
			taskId: "task-running",
		});

		fireEvent.click(
			container.querySelectorAll(".h-8.w-8.cursor-pointer")[1] as HTMLElement,
		);
		expect(tasksRouteMocks.runTask.mutate).toHaveBeenCalledWith("task-pending");
	});

	it("disables run buttons and shows the spinner state while a task mutation is pending", () => {
		tasksRouteMocks.runTask.isPending = true;
		tasksRouteMocks.useSuspenseQuery.mockReturnValue({
			data: [
				{
					enabled: true,
					group: "search",
					id: "task-pending-run",
					interval: 60,
					isRunning: false,
					lastDuration: null,
					lastExecution: null,
					lastMessage: null,
					lastResult: null,
					name: "Queued Task",
					nextExecution: null,
					progress: null,
				},
			],
		});

		const routeConfig = Route as unknown as {
			component: () => JSX.Element;
		};
		const { container } = renderWithProviders(routeConfig.component());

		expect(container.querySelector(".h-8.w-8.cursor-pointer")).toBeDisabled();
		expect(container.querySelector(".animate-spin")).not.toBeNull();
	});
});
