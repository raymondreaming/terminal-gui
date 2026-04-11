import React, { useState } from "react";
import { Icons } from "./Icons";
import { graphNodes } from "./data";
import { gitStatusColors } from "./fileIcons";

// Get git status icon for node type
function NodeStatusIcon({ type }: { type: string }) {
	if (type === "added") {
		return (
			<span className={gitStatusColors.added}>
				<Icons.FilePlus />
			</span>
		);
	}
	if (type === "modified") {
		return (
			<span className={gitStatusColors.modified}>
				<Icons.Edit />
			</span>
		);
	}
	// Normal/entry nodes don't show a status icon
	return null;
}

// Graph View - File Dependencies
export function GraphView() {
	const [hoveredNode, setHoveredNode] = useState<string | null>(null);
	const [selectedNode, setSelectedNode] = useState<string | null>("settings");

	return (
		<div className="flex-1 relative overflow-hidden bg-black">
			{/* Dot grid background */}
			<div
				className="absolute inset-0"
				style={{
					backgroundImage:
						"radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
					backgroundSize: "20px 20px",
				}}
			/>

			{/* Centered graph container */}
			<div className="absolute inset-0 flex items-center justify-center">
				<div className="relative" style={{ width: 800, height: 540 }}>
					{/* SVG for connections */}
					<svg className="absolute inset-0 w-full h-full">
						{graphNodes.map((node) =>
							node.connections.map((targetId) => {
								const target = graphNodes.find((n) => n.id === targetId);
								if (!target) return null;
								const isActive =
									hoveredNode === node.id ||
									hoveredNode === targetId ||
									selectedNode === node.id ||
									selectedNode === targetId;
								return (
									<line
										key={`${node.id}-${targetId}`}
										x1={node.x + 50}
										y1={node.y + 14}
										x2={target.x + 50}
										y2={target.y + 14}
										stroke={
											isActive
												? "rgba(168, 162, 158, 0.5)"
												: "rgba(255,255,255,0.1)"
										}
										strokeWidth={isActive ? 1.5 : 1}
										strokeDasharray={isActive ? "none" : "3 3"}
									/>
								);
							})
						)}
					</svg>

					{/* Nodes */}
					{graphNodes.map((node) => (
						<div
							key={node.id}
							className={`absolute flex items-center gap-1.5 px-2 py-1 rounded-md border border-surgent-border transition-all cursor-pointer ${
								selectedNode === node.id
									? "bg-surgent-surface-2"
									: "bg-surgent-surface"
							}`}
							style={{ left: node.x, top: node.y }}
							onMouseEnter={() => setHoveredNode(node.id)}
							onMouseLeave={() => setHoveredNode(null)}
							onClick={() => setSelectedNode(node.id)}
						>
							<NodeStatusIcon type={node.type} />
							<span className="text-[9px] font-mono text-surgent-text whitespace-nowrap">
								{node.label}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
