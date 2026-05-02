import * as stylex from "@stylexjs/stylex";
import type { ButtonHTMLAttributes } from "react";
import {
	color,
	controlSize,
	font,
	motion,
	radius,
} from "../../tokens.stylex.ts";

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
		borderRadius: radius.lg,
		display: "inline-flex",
		fontWeight: font.weight_5,
		gap: controlSize._1_5,
		justifyContent: "center",
		transitionDuration: motion.durationBase,
		transitionProperty:
			"background-color, border-color, color, transform, opacity",
		transitionTimingFunction: motion.ease,
		":active": {
			transform: "scale(0.97)",
		},
		":disabled": {
			opacity: 0.4,
			pointerEvents: "none",
		},
	},
	sm: {
		fontSize: font.size_3,
		height: controlSize._7,
		paddingInline: controlSize._2_5,
	},
	md: {
		fontSize: font.size_5,
		height: controlSize._8,
		paddingInline: controlSize._3,
	},
	lg: {
		fontSize: font.size_5,
		height: controlSize._9,
		paddingInline: controlSize._4,
	},
	primary: {
		backgroundColor: {
			default: color.accent,
			":hover": color.accentHover,
		},
		color: color.accentForeground,
	},
	secondary: {
		backgroundColor: {
			default: color.surfaceControl,
			":hover": color.surfaceControlHover,
		},
		borderColor: color.border,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.textSoft,
	},
	ghost: {
		backdropFilter: "blur(8px)",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlActive,
		},
		color: {
			default: color.textMuted,
			":hover": color.textMain,
		},
	},
	danger: {
		backgroundColor: {
			default: color.dangerWash,
			":hover": color.dangerHover,
		},
		borderColor: color.dangerBorder,
		borderStyle: "solid",
		borderWidth: 1,
		color: color.danger,
	},
});
