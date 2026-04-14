import type React from "react";

interface EmptyStateProps {
	icon: string | React.ReactNode;
	title: string;
	description: string;
	action?: React.ReactNode;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
}: EmptyStateProps) {
	const visual =
		typeof icon === "string" ? <div className="text-4xl">{icon}</div> : icon;

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 py-16">
			{visual}
			<h3 className="text-lg font-medium text-inferay-text">{title}</h3>
			<p className="max-w-sm text-center text-sm text-inferay-text-2">
				{description}
			</p>
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
