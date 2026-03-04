import type { ComponentType, JSX } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import AllstarrIcon from "src/components/icons/allstarr-icon";
import {
  BookOpen,
  Users,
  Settings,
  FolderOpen,
  Sliders,
  FileText,
  FileType,
  History,
  Library as LibraryIcon,
  Plus,
  Download,
  Radar,
  Monitor,
  Activity,
  ListTodo,
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
} from "src/components/ui/sidebar";

type NavChild = {
  title: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
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
    title: "Bookshelf",
    to: "/bookshelf",
    icon: LibraryIcon,
    matchPrefixes: ["/bookshelf"],
    children: [
      { title: "Add New", to: "/bookshelf/add", icon: Plus },
      { title: "Authors", to: "/bookshelf/authors", icon: Users },
      { title: "Books", to: "/bookshelf/books", icon: BookOpen },
    ],
  },
  {
    title: "Activity",
    to: "/activity",
    icon: Activity,
    matchPrefixes: ["/activity"],
    children: [{ title: "Queue", to: "/activity", icon: Download }],
  },
  {
    title: "Settings",
    to: "/settings",
    icon: Settings,
    matchPrefixes: ["/settings"],
    children: [
      { title: "General", to: "/settings/general", icon: Settings },
      { title: "Metadata", to: "/settings/metadata", icon: FileText },
      { title: "Formats", to: "/settings/formats", icon: FileType },
      { title: "Profiles", to: "/settings/profiles", icon: Sliders },
      { title: "Root Folders", to: "/settings/root-folders", icon: FolderOpen },
      {
        title: "Download Clients",
        to: "/settings/download-clients",
        icon: Download,
      },
      { title: "Indexers", to: "/settings/indexers", icon: Radar },
    ],
  },
  {
    title: "System",
    to: "/system",
    icon: Monitor,
    matchPrefixes: ["/system", "/history"],
    children: [
      { title: "Status", to: "/system/status", icon: Monitor },
      { title: "Tasks", to: "/system/tasks", icon: ListTodo },
      { title: "History", to: "/history", icon: History },
    ],
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

  const isChildActive = (to: string) => {
    return currentPath.startsWith(to);
  };

  return (
    <Sidebar>
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4">
        <Link to="/bookshelf" className="flex items-center gap-2">
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
                      </Link>
                    </SidebarMenuButton>

                    {isActive && group.children.length > 0 && (
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
