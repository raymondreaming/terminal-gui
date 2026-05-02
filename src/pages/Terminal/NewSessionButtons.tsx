import * as stylex from "@stylexjs/stylex";
import { memo } from "react";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition } from "../../lib/agents.ts";
import type { AgentKind } from "../../lib/terminal-utils.ts";
import {
	color,
	controlSize,
	font,
	motion,
	radius,
} from "../../tokens.stylex.ts";

interface NewSessionButtonsProps {
	labelPrefix?: string;
	selectedKind?: AgentKind;
	onAddPane: (kind: AgentKind) => void;
}

export const NewSessionButtons = memo(function NewSessionButtons({
	labelPrefix,
	selectedKind,
	onAddPane,
}: NewSessionButtonsProps) {
	const agentKinds = ["claude", "codex"] as const;
	return (
		<div {...stylex.props(styles.root)}>
			{agentKinds.map((kind) => {
				const label = getAgentDefinition(kind).label;
				const isSelected = kind === selectedKind;
				return (
					<button
						key={kind}
						type="button"
						onClick={() => onAddPane(kind)}
						{...stylex.props(styles.button, isSelected && styles.selected)}
					>
						{getAgentIcon(kind, 12)}
						{labelPrefix ? `${labelPrefix} ${label}` : label}
					</button>
				);
			})}
		</div>
	);
});

const styles = stylex.create({
	root: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: controlSize._1_5,
	},
	button: {
		display: "flex",
		height: controlSize._6,
		alignItems: "center",
		gap: controlSize._1_5,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.transparent,
		borderRadius: radius.md,
		color: color.textMuted,
		fontSize: font.size_4,
		fontWeight: font.weight_5,
		paddingInline: controlSize._2,
		transitionProperty: "background-color, color",
		transitionDuration: motion.durationFast,
		backgroundColor: {
			default: color.transparent,
			":hover": color.controlHover,
		},
		":hover": {
			color: color.textSoft,
		},
	},
	selected: {
		backgroundColor: color.controlActive,
		color: color.textMain,
	},
});
