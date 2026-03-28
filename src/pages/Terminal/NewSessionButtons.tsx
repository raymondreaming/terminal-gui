import { memo } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { getAgentDefinition, NEW_PANE_AGENT_KINDS } from "../../lib/agents.ts";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import type { AgentKind } from "../../lib/terminal-utils.ts";

interface NewSessionButtonsProps {
	labelPrefix?: string;
	onAddPane: (kind: AgentKind) => void;
}

export const NewSessionButtons = memo(function NewSessionButtons({
	labelPrefix,
	onAddPane,
}: NewSessionButtonsProps) {
	return (
		<div className="flex gap-2">
			{NEW_PANE_AGENT_KINDS.map((kind) => {
				const label = getAgentDefinition(kind).label;
				return (
					<Button
						key={kind}
						size="sm"
						variant={kind === "claude" ? "primary" : undefined}
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
