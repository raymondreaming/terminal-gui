import { useCallback, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { resolveServerUrl } from "../../lib/server-origin.ts";
import { readStoredBoolean, writeStoredValue } from "../../lib/stored-json.ts";

function IconTerm({
	size = 15,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<polyline points="4 17 10 11 4 5" />
			<line x1="12" y1="19" x2="20" y2="19" />
		</svg>
	);
}

function IconBranch({
	size = 15,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<circle cx="18" cy="18" r="3" />
			<circle cx="6" cy="6" r="3" />
			<path d="M13 6h3a2 2 0 0 1 2 2v7" />
			<path d="M6 9v12" />
		</svg>
	);
}

function IconSlash({
	size = 15,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M4 17V7l7-4 7 4v10l-7 4z" />
			<path d="M11 3v10" />
			<path d="M4 7l7 4 7-4" />
		</svg>
	);
}

function IconFusion({
	size = 15,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<rect x="3.5" y="4.5" width="8" height="15" rx="2" />
			<path d="M6.5 8.5h2" />
			<path d="M6.5 12h2.5" />
			<path d="M14.5 7.5h5" />
			<path d="M17 7.5v8" />
			<circle cx="17" cy="17.5" r="2.5" />
		</svg>
	);
}

interface NavItem {
	label: string;
	path: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
}

const navItems: NavItem[] = [
	{ label: "Terminal", path: "/terminal", icon: IconTerm },
	{ label: "Experimental", path: "/experimental", icon: IconFusion },
	{ label: "Git", path: "/git", icon: IconBranch },
	{ label: "Prompts", path: "/prompts", icon: IconSlash },
];

const logoUrl = resolveServerUrl("/logo.png");

export function Sidebar() {
	const [collapsed, setCollapsed] = useState(() => {
		return readStoredBoolean("sidebar-collapsed");
	});
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		writeStoredValue("sidebar-collapsed", String(collapsed));
	}, [collapsed]);

	// Arrow left/right to navigate between sidebar pages
	const handleGlobalKeys = useCallback(
		(e: KeyboardEvent) => {
			// Only when no input/textarea is focused
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
				const currentIdx = navItems.findIndex((item) =>
					location.pathname.startsWith(item.path)
				);
				if (currentIdx === -1) return;
				let nextIdx: number;
				if (e.key === "ArrowLeft") {
					nextIdx = currentIdx <= 0 ? navItems.length - 1 : currentIdx - 1;
				} else {
					nextIdx = currentIdx >= navItems.length - 1 ? 0 : currentIdx + 1;
				}
				e.preventDefault();
				navigate(navItems[nextIdx]!.path);
			}
		},
		[location.pathname, navigate]
	);

	useEffect(() => {
		window.addEventListener("keydown", handleGlobalKeys);
		return () => window.removeEventListener("keydown", handleGlobalKeys);
	}, [handleGlobalKeys]);

	return (
		<aside
			className={`relative flex flex-col border-r border-surgent-border bg-surgent-bg transition-all duration-200 ${
				collapsed ? "w-12" : "w-48"
			}`}
		>
			<div className="electrobun-webkit-app-region-drag flex h-12 items-center px-3 border-b border-surgent-border">
				<button
					onClick={() => setCollapsed(!collapsed)}
					className="electrobun-webkit-app-region-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-surgent-text/[0.05] transition-colors"
				>
					<img src={logoUrl} alt="" className="h-7 w-7 rounded" />
				</button>
			</div>
			<nav className="flex-1 overflow-y-auto py-1.5 scrollbar-none">
				{navItems.map((item) => {
					const Icon = item.icon;
					return (
						<NavLink
							key={item.path}
							to={item.path}
							className={({ isActive }) =>
								`mx-1 mb-px flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
									isActive
										? "bg-surgent-text/[0.06] text-surgent-text"
										: "text-surgent-text-3 hover:bg-surgent-text/[0.03] hover:text-surgent-text-2"
								} ${collapsed ? "justify-center !px-0" : ""}`
							}
							title={collapsed ? item.label : undefined}
						>
							<Icon size={14} className="shrink-0" />
							{!collapsed && <span>{item.label}</span>}
						</NavLink>
					);
				})}
			</nav>
		</aside>
	);
}
