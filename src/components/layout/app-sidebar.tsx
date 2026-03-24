import type { ComponentType, JSX } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import AllstarrIcon from "src/components/icons/allstarr-icon";
import { queueListQuery } from "src/lib/queries/queue";
import {
  BookOpen,
  Users,
  Settings,
  ShieldBan,
  Library as LibraryIcon,
  Plus,
  Download,
  History,
  Activity,
  Monitor,
  Film,
  Tv,
  Calendar,
} from "lucide-react";
import { settingsNavItems, systemNavItems } from "src/lib/nav-config";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
} from "src/components/ui/sidebar";

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
    matchPrefixes: ["/books", "/authors"],
    children: [
      { title: "Add New", to: "/books/add", icon: Plus },
      { title: "Authors", to: "/authors", icon: Users },
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
  const activeGroup = getActiveGroup(currentPath, navGroups);
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
              {navGroups.map((group) => {
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
