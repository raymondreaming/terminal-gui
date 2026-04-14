import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { resolveServerUrl } from "../../lib/server-origin.ts";
import { readStoredBoolean, writeStoredValue } from "../../lib/stored-json.ts";
import { IconSettings, IconUser } from "../ui/Icons.tsx";

function IconBranch({
	size = 15,
	className = "",
}: {
	size?: number;
	className?: string;
}) {
	return (
		<svg
			aria-hidden="true"
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
			aria-hidden="true"
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

interface NavItem {
	label: string;
	path: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
}

const navItems: NavItem[] = [
	{ label: "Git", path: "/git", icon: IconBranch },
	{ label: "Prompts", path: "/prompts", icon: IconSlash },
];

const logoUrl = resolveServerUrl("/logo.png");
const logoImageStyle = {
	filter: "saturate(0.94) contrast(1.04) brightness(0.99)",
};
const logoOverlayStyle = {
	backgroundColor: "var(--color-inferay-accent)",
	opacity: 0.06,
	maskImage: `url(${logoUrl})`,
	maskPosition: "center",
	maskRepeat: "no-repeat",
	maskSize: "cover",
	WebkitMaskImage: `url(${logoUrl})`,
	WebkitMaskPosition: "center",
	WebkitMaskRepeat: "no-repeat",
	WebkitMaskSize: "cover",
};

export function Sidebar() {
	const [collapsed, setCollapsed] = useState(() => {
		return readStoredBoolean("sidebar-collapsed");
	});

	useEffect(() => {
		writeStoredValue("sidebar-collapsed", String(collapsed));
	}, [collapsed]);

	return (
		<aside
			className={`relative flex flex-col border-r border-inferay-border bg-inferay-bg transition-all duration-200 ${
				collapsed ? "w-12" : "w-48"
			}`}
		>
			<div className="electrobun-webkit-app-region-drag flex h-12 items-center px-3 border-b border-inferay-border">
				<button
					type="button"
					onClick={() => setCollapsed(!collapsed)}
					className="electrobun-webkit-app-region-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
				>
					<span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-md">
						<img
							src={logoUrl}
							alt=""
							className="h-7 w-7 rounded-md"
							style={logoImageStyle}
						/>
						<span
							className="absolute inset-0 pointer-events-none rounded-md"
							style={logoOverlayStyle}
						/>
					</span>
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
										? "bg-inferay-text/[0.06] text-inferay-text"
										: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
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
			<div className="border-t border-inferay-border p-1.5">
				<button
					type="button"
					onClick={() =>
						window.dispatchEvent(new Event("terminal-open-theme-panel"))
					}
					className={`w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2 ${collapsed ? "justify-center !px-0" : ""}`}
					title={collapsed ? "Settings" : undefined}
				>
					<IconSettings size={14} className="shrink-0" />
					{!collapsed ? <span>Settings</span> : null}
				</button>
				<NavLink
					to="/profile"
					className={({ isActive }) =>
						`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
							isActive
								? "bg-inferay-text/[0.06] text-inferay-text"
								: "text-inferay-text-3 hover:bg-inferay-text/[0.03] hover:text-inferay-text-2"
						} ${collapsed ? "justify-center !px-0" : ""}`
					}
					title={collapsed ? "Profile" : undefined}
				>
					<IconUser size={14} className="shrink-0" />
					{!collapsed ? <span>Profile</span> : null}
				</NavLink>
			</div>
		</aside>
	);
}
