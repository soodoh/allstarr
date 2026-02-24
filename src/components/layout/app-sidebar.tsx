import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Users,
  LayoutDashboard,
  UserPlus,
  BookPlus,
  Settings,
  FolderOpen,
  Sliders,
  History,
  Library,
  Search,
  Download,
  Radar,
  Plus,
  Monitor,
  Activity,
} from "lucide-react";
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
} from "~/components/ui/sidebar";

type NavChild = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  title: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes: string[];
  children: NavChild[];
};

const navGroups: NavGroup[] = [
  {
    title: "Library",
    to: "/library",
    icon: Library,
    matchPrefixes: ["/", "/search", "/authors", "/books", "/library", "/hardcover"],
    children: [
      { title: "Dashboard", to: "/", icon: LayoutDashboard },
      { title: "Search", to: "/search", icon: Search },
      { title: "Authors", to: "/authors", icon: Users },
      { title: "Books", to: "/books", icon: BookOpen },
    ],
  },
  {
    title: "Add New",
    to: "/add",
    icon: Plus,
    matchPrefixes: ["/add"],
    children: [
      { title: "Add Author", to: "/add/author", icon: UserPlus },
      { title: "Add Book", to: "/add/book", icon: BookPlus },
    ],
  },
  {
    title: "Settings",
    to: "/settings",
    icon: Settings,
    matchPrefixes: ["/settings"],
    children: [
      { title: "General", to: "/settings/general", icon: Settings },
      { title: "Profiles", to: "/settings/profiles", icon: Sliders },
      { title: "Root Folders", to: "/settings/root-folders", icon: FolderOpen },
      { title: "Download Clients", to: "/settings/download-clients", icon: Download },
      { title: "Indexers", to: "/settings/indexers", icon: Radar },
    ],
  },
  {
    title: "System",
    to: "/system",
    icon: Monitor,
    matchPrefixes: ["/system", "/history"],
    children: [
      { title: "Status", to: "/system/status", icon: Activity },
      { title: "History", to: "/history", icon: History },
    ],
  },
];

function getActiveGroup(currentPath: string, groups: NavGroup[]): NavGroup {
  // Check non-root prefixes first to avoid false "/" matches
  const nonRootMatch = groups.find((group) =>
    group.matchPrefixes
      .filter((p) => p !== "/")
      .some((prefix) => currentPath.startsWith(prefix)),
  );
  if (nonRootMatch) {return nonRootMatch;}

  // Check exact root match
  const rootMatch = groups.find((group) =>
    group.matchPrefixes.includes("/") && currentPath === "/",
  );
  if (rootMatch) {return rootMatch;}

  // Fallback to Library
  return groups[0];
}

export default function AppSidebar(): React.JSX.Element {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const activeGroup = getActiveGroup(currentPath, navGroups);

  const isChildActive = (to: string) => {
    if (to === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(to);
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4">
        <Link to="/" className="flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
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
                      </Link>
                    </SidebarMenuButton>

                    {isActive && (
                      <SidebarMenuSub>
                        {group.children.map((child) => (
                          <SidebarMenuSubItem key={child.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isChildActive(child.to)}
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
