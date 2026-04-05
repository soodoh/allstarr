import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Activity,
	BookOpen,
	Calendar,
	Download,
	Film,
	FolderOpen,
	History,
	Layers,
	Library as LibraryIcon,
	Monitor,
	Plus,
	Settings,
	ShieldBan,
	Tv,
	Users,
} from "lucide-react";
import type { ComponentType, JSX } from "react";
import AllstarrIcon from "src/components/icons/allstarr-icon";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "src/components/ui/sidebar";
import { useUserRole } from "src/hooks/use-role";
import { settingsNavItems, systemNavItems } from "src/lib/nav-config";
import { queueListQuery } from "src/lib/queries/queue";

type NavChild = {
	title: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	description?: string;
};

type NavGroup = {
	title: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	matchPrefixes: string[];
	children: NavChild[];
};

const navGroups: NavGroup[] = [
	{
		title: "Books",
		to: "/books",
		icon: LibraryIcon,
		matchPrefixes: ["/books", "/authors", "/series"],
		children: [
			{ title: "Add New", to: "/books/add", icon: Plus },
			{ title: "Authors", to: "/authors", icon: Users },
			{ title: "Series", to: "/series", icon: Layers },
			{ title: "Books", to: "/books", icon: BookOpen },
		],
	},
	{
		title: "TV Shows",
		to: "/tv",
		icon: Tv,
		matchPrefixes: ["/tv"],
		children: [
			{ title: "Add New", to: "/tv/add", icon: Plus },
			{ title: "Series", to: "/tv", icon: Tv },
			{ title: "Calendar", to: "/tv/calendar", icon: Calendar },
		],
	},
	{
		title: "Movies",
		to: "/movies",
		icon: Film,
		matchPrefixes: ["/movies"],
		children: [
			{ title: "Add New", to: "/movies/add", icon: Plus },
			{ title: "Movies", to: "/movies", icon: Film },
			{ title: "Collections", to: "/movies/collections", icon: FolderOpen },
			{ title: "Calendar", to: "/movies/calendar", icon: Calendar },
		],
	},
	{
		title: "Activity",
		to: "/activity",
		icon: Activity,
		matchPrefixes: ["/activity"],
		children: [
			{ title: "Queue", to: "/activity", icon: Download },
			{ title: "History", to: "/activity/history", icon: History },
			{ title: "Blocklist", to: "/activity/blocklist", icon: ShieldBan },
		],
	},
	{
		title: "Settings",
		to: "/settings",
		icon: Settings,
		matchPrefixes: ["/settings"],
		children: settingsNavItems,
	},
	{
		title: "System",
		to: "/system",
		icon: Monitor,
		matchPrefixes: ["/system"],
		children: systemNavItems,
	},
];

function getActiveGroup(currentPath: string, groups: NavGroup[]): NavGroup {
	const match = groups.find((group) =>
		group.matchPrefixes.some((prefix) => currentPath.startsWith(prefix)),
	);
	return match ?? groups[0];
}

export default function AppSidebar(): JSX.Element {
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const role = useUserRole();
	const visibleGroups =
		role === "requester"
			? [
					{
						title: "Requests",
						to: "/requests",
						icon: BookOpen,
						matchPrefixes: ["/requests"],
						children: [],
					} satisfies NavGroup,
				]
			: navGroups;
	const activeGroup = getActiveGroup(currentPath, visibleGroups);
	const { data: queueCount } = useQuery({
		...queueListQuery(),
		select: (data) => data.items.length,
	});

	const isChildActive = (childTo: string, groupTo: string) => {
		if (childTo === groupTo) {
			return currentPath === childTo || currentPath === `${childTo}/`;
		}
		return currentPath.startsWith(childTo);
	};

	return (
		<Sidebar>
			<SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4">
				<Link to="/books" className="flex items-center gap-2">
					<AllstarrIcon className="h-6 w-6" />
					<span className="text-lg font-bold">Allstarr</span>
				</Link>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{visibleGroups.map((group) => {
								const isActive = group.title === activeGroup.title;
								return (
									<SidebarMenuItem key={group.title}>
										<SidebarMenuButton
											asChild
											isActive={isActive}
											className={
												isActive
													? "relative before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
													: ""
											}
										>
											<Link to={group.to}>
												<group.icon className="h-4 w-4" />
												<span>{group.title}</span>
												{group.title === "Activity" &&
													queueCount !== undefined &&
													queueCount > 0 && (
														<span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
															{queueCount}
														</span>
													)}
											</Link>
										</SidebarMenuButton>

										{isActive && group.children.length > 0 && (
											<SidebarMenuSub>
												{group.children.map((child) => (
													<SidebarMenuSubItem key={child.title}>
														<SidebarMenuSubButton
															asChild
															isActive={isChildActive(child.to, group.to)}
														>
															<Link to={child.to}>
																<child.icon className="h-4 w-4" />
																<span>{child.title}</span>
															</Link>
														</SidebarMenuSubButton>
													</SidebarMenuSubItem>
												))}
											</SidebarMenuSub>
										)}
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}
