import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "primary" | "secondary" | "ghost" | "danger";
	size?: "sm" | "md" | "lg";
}

export function Button({
	variant = "secondary",
	size = "md",
	className = "",
	children,
	...props
}: ButtonProps) {
	const base =
		"inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.97]";
	const sizes = {
		sm: "h-7 px-2.5 text-xs",
		md: "h-8 px-3 text-sm",
		lg: "h-9 px-4 text-sm",
	};
	const variants = {
		primary: "bg-surgent-accent text-white hover:bg-surgent-accent-hover",
		secondary:
			"bg-surgent-surface-2 text-surgent-text-2 hover:bg-surgent-surface-3 border border-surgent-border",
		ghost:
			"text-surgent-text-3 hover:text-surgent-text hover:bg-surgent-text/[0.08] backdrop-blur-sm",
		danger:
			"bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20",
	};
	return (
		<button
			className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
