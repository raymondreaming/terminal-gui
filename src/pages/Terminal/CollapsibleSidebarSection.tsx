import * as stylex from "@stylexjs/stylex";
import { memo, type ReactNode } from "react";
import {
	IconChevronDown,
	IconChevronRight,
} from "../../components/ui/Icons.tsx";
import { color, controlSize, font, motion } from "../../tokens.stylex.ts";

export const CollapsibleSidebarSection = memo(
	function CollapsibleSidebarSection({
		icon,
		label,
		count,
		countColor,
		expanded,
		onToggle,
		emptyMessage,
		children,
	}: {
		icon: ReactNode;
		label: string;
		count: number;
		countColor: string;
		expanded: boolean;
		onToggle: () => void;
		emptyMessage: string;
		children: ReactNode;
	}) {
		return (
			<div {...stylex.props(styles.root)}>
				<button
					type="button"
					onClick={onToggle}
					{...stylex.props(styles.trigger)}
				>
					{expanded ? (
						<IconChevronDown size={10} />
					) : (
						<IconChevronRight size={10} />
					)}
					{icon}
					<span {...stylex.props(styles.label)}>{label}</span>
					{count > 0 && (
						<span
							{...stylex.props(
								styles.count,
								countColor.includes("red") && styles.countDanger,
								countColor.includes("amber") && styles.countWarning,
								countColor.includes("accent") && styles.countAccent
							)}
						>
							{count}
						</span>
					)}
				</button>
				{expanded && (
					<div {...stylex.props(styles.body)}>
						{count > 0 ? (
							children
						) : (
							<p {...stylex.props(styles.empty)}>{emptyMessage}</p>
						)}
					</div>
				)}
			</div>
		);
	}
);

const styles = stylex.create({
	root: {
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
	},
	trigger: {
		display: "flex",
		width: "100%",
		alignItems: "center",
		gap: controlSize._1_5,
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
		paddingBlock: controlSize._1_5,
		paddingInline: controlSize._2,
		transitionProperty: "color",
		transitionDuration: motion.durationFast,
	},
	label: {
		fontSize: font.size_1,
		fontWeight: font.weight_6,
		letterSpacing: "0.08em",
		textTransform: "uppercase",
	},
	count: {
		marginLeft: "auto",
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	countDanger: {
		color: color.danger,
	},
	countWarning: {
		color: color.warning,
	},
	countAccent: {
		color: color.accent,
	},
	body: {
		maxHeight: "300px",
		overflowY: "auto",
		paddingInline: controlSize._2,
		paddingBottom: controlSize._2,
	},
	empty: {
		color: color.textMuted,
		fontSize: font.size_2,
		paddingBlock: controlSize._2,
		paddingInline: controlSize._2,
		textAlign: "center",
	},
});
