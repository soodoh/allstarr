import {
	Activity,
	Download,
	FileText,
	FileType,
	HardDrive,
	History,
	ListFilter,
	ListPlus,
	ListTodo,
	Radar,
	Settings,
	Sliders,
	Users,
} from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
	title: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
	description: string;
};

export const settingsNavItems: NavItem[] = [
	{
		title: "Users",
		to: "/settings/users",
		icon: Users,
		description: "Manage users, roles, and authentication providers.",
	},
	{
		title: "General",
		to: "/settings/general",
		icon: Settings,
		description: "Configure log levels, API key, and global app behavior.",
	},
	{
		title: "Media Management",
		to: "/settings/media-management",
		icon: HardDrive,
		description:
			"Configure book naming, file import behavior, permissions, and recycling bin.",
	},
	{
		title: "Metadata",
		to: "/settings/metadata",
		icon: FileText,
		description: "Configure language preferences and book import filters.",
	},
	{
		title: "Formats",
		to: "/settings/formats",
		icon: FileType,
		description:
			"Define format types like EPUB, MOBI, PDF and their matching rules.",
	},
	{
		title: "Custom Formats",
		to: "/settings/custom-formats",
		icon: ListFilter,
		description: "Custom scoring rules for release quality and preferences.",
	},
	{
		title: "Profiles",
		to: "/settings/profiles",
		icon: Sliders,
		description: "Configure format preferences and upgrade rules per author.",
	},
	{
		title: "Download Clients",
		to: "/settings/download-clients",
		icon: Download,
		description:
			"Connect download clients (e.g. qBittorrent, SABnzbd) used to grab books.",
	},
	{
		title: "Indexers",
		to: "/settings/indexers",
		icon: Radar,
		description:
			"Configure Usenet or torrent indexers used to search for book releases.",
	},
	{
		title: "Import Lists",
		to: "/settings/import-lists",
		icon: ListPlus,
		description: "Manage import lists and exclusions",
	},
];

export const systemNavItems: NavItem[] = [
	{
		title: "Status",
		to: "/system/status",
		icon: Activity,
		description:
			"Health checks, disk space, and system information at a glance.",
	},
	{
		title: "Tasks",
		to: "/system/tasks",
		icon: ListTodo,
		description:
			"Scheduled background tasks like metadata refresh, health checks, and backups.",
	},
	{
		title: "Events",
		to: "/system/events",
		icon: History,
		description:
			"View a log of all events — books added, updated, deleted, and more.",
	},
];
