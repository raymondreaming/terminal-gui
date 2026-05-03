import type { ComponentType } from "react";
import {
	IconCamera,
	IconCode,
	IconGitBranch,
	IconGitCommit,
	IconMessageCircle,
	IconSimulator,
	IconSlash,
} from "../components/ui/Icons.tsx";

export type AppRouteId =
	| "terminal"
	| "git"
	| "prompts"
	| "images"
	| "simulators"
	| "profile";

export type TerminalMainView = "chat" | "editor" | "changes" | "graph";

type NavigationIcon = ComponentType<{ size?: number; className?: string }>;

interface AppPageRoute {
	id: AppRouteId;
	label: string;
	path: string;
	sidebar?: boolean;
	icon?: NavigationIcon;
}

interface TerminalMainViewRoute {
	id: TerminalMainView;
	label: string;
	icon: NavigationIcon;
}

export const DEFAULT_APP_ROUTE = "/terminal";
export const DEFAULT_TERMINAL_MAIN_VIEW: TerminalMainView = "editor";

export const APP_PAGE_ROUTES = [
	{ id: "terminal", label: "Terminal", path: "/terminal" },
	{ id: "git", label: "Git", path: "/git" },
	{
		id: "prompts",
		label: "Prompts",
		path: "/prompts",
		sidebar: true,
		icon: IconSlash,
	},
	{
		id: "images",
		label: "Images",
		path: "/images",
		sidebar: true,
		icon: IconCamera,
	},
	{
		id: "simulators",
		label: "Simulators",
		path: "/simulators",
		sidebar: true,
		icon: IconSimulator,
	},
	{ id: "profile", label: "Profile", path: "/profile" },
] as const satisfies readonly AppPageRoute[];

export const SIDEBAR_NAV_ROUTES = APP_PAGE_ROUTES.filter(
	(
		route
	): route is AppPageRoute & {
		sidebar: true;
		icon: NavigationIcon;
	} => route.sidebar === true && !!route.icon
);

export const TERMINAL_MAIN_VIEWS = [
	{ id: "chat", label: "Chat", icon: IconMessageCircle },
	{ id: "editor", label: "Editor", icon: IconCode },
	{ id: "changes", label: "Changes", icon: IconGitCommit },
	{ id: "graph", label: "Graph", icon: IconGitBranch },
] as const satisfies readonly TerminalMainViewRoute[];

export function isTerminalMainView(
	value: string | null
): value is TerminalMainView {
	return TERMINAL_MAIN_VIEWS.some((view) => view.id === value);
}
