import { memo, type ReactNode } from "react";
import {
	IconChevronDown,
	IconChevronRight,
} from "../../components/ui/Icons.tsx";

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
			<div className="border-t border-surgent-border">
				<button
					type="button"
					onClick={onToggle}
					className="flex items-center gap-1.5 px-2 py-1.5 w-full text-surgent-text-3 hover:text-surgent-text-2 transition-colors"
				>
					{expanded ? (
						<IconChevronDown size={10} />
					) : (
						<IconChevronRight size={10} />
					)}
					{icon}
					<span className="text-[9px] font-bold tracking-widest uppercase">
						{label}
					</span>
					{count > 0 && (
						<span className={`ml-auto text-[9px] font-medium ${countColor}`}>
							{count}
						</span>
					)}
				</button>
				{expanded && (
					<div className="max-h-[300px] overflow-y-auto px-2 pb-2">
						{count > 0 ? (
							children
						) : (
							<p className="text-[10px] text-surgent-text-3 px-2 py-2 text-center">
								{emptyMessage}
							</p>
						)}
					</div>
				)}
			</div>
		);
	}
);
