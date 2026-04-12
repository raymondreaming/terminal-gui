import { memo } from "react";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import { AGENT_DEFINITIONS, type AgentKind } from "../../lib/agents.ts";

interface AgentPickerProps {
	onSelect: (kind: AgentKind) => void;
}

const PICKER_AGENTS: {
	kind: AgentKind;
	disabled?: boolean;
	badge?: string;
}[] = [
	{ kind: "claude" },
	{ kind: "codex" },
	{ kind: "local", disabled: true, badge: "Soon" },
	{ kind: "terminal" },
];

export const AgentPicker = memo(function AgentPicker({
	onSelect,
}: AgentPickerProps) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-4">
			<p className="text-xs font-medium text-surgent-text-3">Add Agent</p>
			<div className="flex flex-wrap items-center justify-center gap-2">
				{PICKER_AGENTS.map(({ kind, disabled, badge }) => {
					const def = AGENT_DEFINITIONS[kind];
					return (
						<button
							type="button"
							key={kind}
							disabled={disabled}
							onClick={() => onSelect(kind)}
							className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-all ${
								disabled
									? "border-surgent-border/50 opacity-40 cursor-not-allowed"
									: "border-surgent-border bg-surgent-surface hover:border-surgent-accent/40 hover:bg-surgent-surface-2 cursor-pointer"
							}`}
						>
							<span className="text-surgent-text-2 shrink-0">
								{getAgentIcon(kind, 16)}
							</span>
							<span className="font-medium text-surgent-text">{def.label}</span>
							{badge && (
								<span className="text-[8px] font-semibold uppercase tracking-wider text-surgent-text-3 bg-surgent-text/5 rounded px-1 py-0.5">
									{badge}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
});
