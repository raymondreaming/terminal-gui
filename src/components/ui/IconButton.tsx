import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "ghost" | "danger" | "subtle";
	size?: "xs" | "sm" | "md";
}

export function IconButton({
	variant = "ghost",
	size = "sm",
	className = "",
	children,
	...props
}: IconButtonProps) {
	const base =
		"inline-flex items-center justify-center rounded-md transition-all disabled:opacity-40 disabled:pointer-events-none";
	const sizes = { xs: "p-0.5", sm: "p-1", md: "p-1.5" };
	const variants = {
		ghost:
			"text-surgent-text-3 hover:text-surgent-text-2 hover:bg-surgent-text/[0.06]",
		danger: "text-surgent-text-3 hover:text-red-400 hover:bg-red-500/10",
		subtle: "text-surgent-text-3 hover:text-surgent-text-2",
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
