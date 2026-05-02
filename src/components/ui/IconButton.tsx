import * as stylex from "@stylexjs/stylex";
import type { ButtonHTMLAttributes } from "react";
import { color, controlSize, motion, radius } from "../../tokens.stylex.ts";

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
	const buttonProps = stylex.props(styles.base, styles[size], styles[variant]);

	return (
		<button
			{...buttonProps}
			className={`${buttonProps.className ?? ""} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}

const styles = stylex.create({
	base: {
		alignItems: "center",
		borderRadius: radius.md,
		display: "inline-flex",
		justifyContent: "center",
		transitionDuration: motion.durationBase,
		transitionProperty: "background-color, color, opacity",
		transitionTimingFunction: motion.ease,
		":disabled": {
			opacity: 0.4,
			pointerEvents: "none",
		},
	},
	xs: {
		padding: controlSize._0_5,
	},
	sm: {
		padding: controlSize._1,
	},
	md: {
		padding: controlSize._1_5,
	},
	ghost: {
		backgroundColor: {
			default: color.transparent,
			":hover": color.controlHover,
		},
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
	},
	danger: {
		backgroundColor: {
			default: color.transparent,
			":hover": color.dangerWash,
		},
		color: {
			default: color.textMuted,
			":hover": color.danger,
		},
	},
	subtle: {
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
	},
});
