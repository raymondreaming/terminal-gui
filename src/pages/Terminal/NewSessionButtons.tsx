import { memo } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { getAgentDefinition, NEW_PANE_AGENT_KINDS } from "../../lib/agents.ts";
import type { AgentKind } from "../../lib/terminal-utils.ts";

interface NewSessionButtonsProps {
	labelPrefix?: string;
	layout?: "row" | "column";
	onAddPane: (kind: AgentKind) => void;
}

export const NewSessionButtons = memo(function NewSessionButtons({
	labelPrefix,
	layout = "row",
	onAddPane,
}: NewSessionButtonsProps) {
	return (
		<div
			className={
				layout === "column"
					? "flex w-full max-w-56 flex-col gap-2"
					: "flex flex-wrap gap-2"
			}
		>
			{NEW_PANE_AGENT_KINDS.map((kind) => {
				const label = getAgentDefinition(kind).label;
				return (
					<Button
						key={kind}
						size="sm"
						variant="secondary"
						className={layout === "column" ? "w-full" : ""}
						onClick={() => onAddPane(kind)}
					>
						{labelPrefix &&
							kind !== "terminal" &&
							getAgentIcon(kind, 12, "mr-1.5")}
						{labelPrefix ? `${labelPrefix} ${label}` : label}
					</Button>
				);
			})}
		</div>
	);
});
