import type { JSX, ReactNode } from "react";
import { SidebarProvider } from "src/components/ui/sidebar";
import { TooltipProvider } from "src/components/ui/tooltip";
import AppSidebar from "./app-sidebar";
import Header from "./header";

type AppLayoutProps = {
	children: ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps): JSX.Element {
	return (
		<TooltipProvider>
			<SidebarProvider>
				<div className="flex min-h-screen w-full">
					<AppSidebar />
					<div className="flex min-w-0 flex-1 flex-col">
						<Header />
						<main className="flex-1 overflow-x-hidden p-4 sm:p-6">
							{children}
						</main>
					</div>
				</div>
			</SidebarProvider>
		</TooltipProvider>
	);
}
