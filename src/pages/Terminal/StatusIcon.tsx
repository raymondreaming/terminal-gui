import {
	IconAlertTriangle,
	IconCircle,
	IconMessageCircle,
	IconSparkles,
	IconTerminal,
	IconWrench,
} from "../../components/ui/Icons.tsx";
import type { StatusIconType } from "../../lib/terminal-utils.ts";

export function StatusIcon({
	iconType,
	size,
	className,
}: {
	iconType: StatusIconType;
	size: number;
	className?: string;
}) {
	switch (iconType) {
		case "sparkles":
			return <IconSparkles size={size} className={className} />;
		case "message":
			return <IconMessageCircle size={size} className={className} />;
		case "alert":
			return <IconAlertTriangle size={size} className={className} />;
		case "wrench":
			return <IconWrench size={size} className={className} />;
		case "terminal":
			return <IconTerminal size={size} className={className} />;
		default:
			return <IconCircle size={size} className={className} />;
	}
}
