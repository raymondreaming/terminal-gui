import React, { useState, useRef, useCallback } from "react";
import { Icons } from "./Icons";

type NodeType =
	| "prompt"
	| "research"
	| "image"
	| "code"
	| "condition"
	| "output"
	| "input";

type WorkflowNode = {
	id: string;
	type: NodeType;
	title: string;
	x: number;
	y: number;
	config: Record<string, unknown>;
	inputs: string[];
	outputs: string[];
};

type Connection = {
	id: string;
	from: string;
	fromPort: string;
	to: string;
	toPort: string;
};

type SavedWorkflow = {
	id: string;
	name: string;
	description: string;
	nodeCount: number;
	lastEdited: string;
	status: "draft" | "active" | "completed";
};

const savedWorkflows: SavedWorkflow[] = [
	{
		id: "wf1",
		name: "Article Generator",
		description: "Research topic, generate image, write article",
		nodeCount: 5,
		lastEdited: "Just now",
		status: "active",
	},
	{
		id: "wf2",
		name: "Code Review Pipeline",
		description: "Analyze code, find bugs, suggest fixes",
		nodeCount: 4,
		lastEdited: "2h ago",
		status: "draft",
	},
	{
		id: "wf3",
		name: "Social Media Posts",
		description: "Generate content for multiple platforms",
		nodeCount: 6,
		lastEdited: "1d ago",
		status: "completed",
	},
	{
		id: "wf4",
		name: "Data Analysis",
		description: "Process CSV, analyze trends, create report",
		nodeCount: 5,
		lastEdited: "3d ago",
		status: "draft",
	},
];

const nodeTypes: Record<
	NodeType,
	{ label: string; color: string; icon: React.ReactNode }
> = {
	input: {
		label: "Input",
		color: "emerald",
		icon: <Icons.FilePlus />,
	},
	prompt: {
		label: "Prompt",
		color: "blue",
		icon: <Icons.Terminal />,
	},
	research: {
		label: "Research",
		color: "purple",
		icon: <Icons.Search />,
	},
	image: {
		label: "Generate Image",
		color: "pink",
		icon: <Icons.Image />,
	},
	code: {
		label: "Code",
		color: "amber",
		icon: <Icons.Code />,
	},
	condition: {
		label: "Condition",
		color: "orange",
		icon: <Icons.Branch />,
	},
	output: {
		label: "Output",
		color: "cyan",
		icon: <Icons.Eye />,
	},
};

const initialNodes: WorkflowNode[] = [
	{
		id: "1",
		type: "input",
		title: "Topic Input",
		x: 80,
		y: 180,
		config: { value: "AI in healthcare" },
		inputs: [],
		outputs: ["out"],
	},
	{
		id: "2",
		type: "research",
		title: "Research Topic",
		x: 260,
		y: 120,
		config: { depth: "thorough", sources: 5 },
		inputs: ["topic"],
		outputs: ["findings"],
	},
	{
		id: "3",
		type: "image",
		title: "Generate Hero Image",
		x: 260,
		y: 240,
		config: { model: "flux-pro", style: "professional" },
		inputs: ["prompt"],
		outputs: ["image"],
	},
	{
		id: "4",
		type: "prompt",
		title: "Write Article",
		x: 460,
		y: 180,
		config: {
			model: "claude-opus",
			template: "Write an article about {{topic}} using {{findings}}",
		},
		inputs: ["findings", "image"],
		outputs: ["article"],
	},
	{
		id: "5",
		type: "output",
		title: "Final Output",
		x: 660,
		y: 180,
		config: { format: "markdown" },
		inputs: ["content"],
		outputs: [],
	},
];

const initialConnections: Connection[] = [
	{ id: "c1", from: "1", fromPort: "out", to: "2", toPort: "topic" },
	{ id: "c2", from: "1", fromPort: "out", to: "3", toPort: "prompt" },
	{ id: "c3", from: "2", fromPort: "findings", to: "4", toPort: "findings" },
	{ id: "c4", from: "3", fromPort: "image", to: "4", toPort: "image" },
	{ id: "c5", from: "4", fromPort: "article", to: "5", toPort: "content" },
];

function NodeComponent({
	node,
	isSelected,
	onSelect,
	onDrag,
	connections,
}: {
	node: WorkflowNode;
	isSelected: boolean;
	onSelect: () => void;
	onDrag: (id: string, x: number, y: number) => void;
	connections: Connection[];
}) {
	const nodeType = nodeTypes[node.type];
	const dragRef = useRef<{ startX: number; startY: number } | null>(null);

	const handleMouseDown = (e: React.MouseEvent) => {
		e.stopPropagation();
		onSelect();
		dragRef.current = {
			startX: e.clientX - node.x,
			startY: e.clientY - node.y,
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (dragRef.current) {
				onDrag(
					node.id,
					e.clientX - dragRef.current.startX,
					e.clientY - dragRef.current.startY
				);
			}
		};

		const handleMouseUp = () => {
			dragRef.current = null;
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const hasInputConnection = (port: string) =>
		connections.some((c) => c.to === node.id && c.toPort === port);
	const hasOutputConnection = (port: string) =>
		connections.some((c) => c.from === node.id && c.fromPort === port);

	const colorClasses: Record<string, string> = {
		emerald: "border-emerald-500/50 bg-emerald-500/5",
		blue: "border-blue-500/50 bg-blue-500/5",
		purple: "border-purple-500/50 bg-purple-500/5",
		pink: "border-pink-500/50 bg-pink-500/5",
		amber: "border-amber-500/50 bg-amber-500/5",
		orange: "border-orange-500/50 bg-orange-500/5",
		cyan: "border-cyan-500/50 bg-cyan-500/5",
	};

	const dotColors: Record<string, string> = {
		emerald: "bg-emerald-500",
		blue: "bg-blue-500",
		purple: "bg-purple-500",
		pink: "bg-pink-500",
		amber: "bg-amber-500",
		orange: "bg-orange-500",
		cyan: "bg-cyan-500",
	};

	return (
		<div
			className={`absolute select-none cursor-grab active:cursor-grabbing`}
			style={{ left: node.x, top: node.y }}
			onMouseDown={handleMouseDown}
		>
			<div
				className={`w-[140px] rounded-lg border ${colorClasses[nodeType.color]} ${
					isSelected
						? "ring-2 ring-surgent-accent ring-offset-1 ring-offset-surgent-bg"
						: ""
				} backdrop-blur-sm transition-shadow hover:shadow-lg`}
			>
				{/* Header */}
				<div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-surgent-border/30">
					<span
						className={`${dotColors[nodeType.color]} p-0.5 rounded text-white`}
					>
						{nodeType.icon}
					</span>
					<span className="text-[9px] font-medium text-surgent-text truncate">
						{node.title}
					</span>
				</div>

				{/* Ports */}
				<div className="px-2 py-1.5 space-y-1">
					{/* Input ports */}
					{node.inputs.map((input) => (
						<div key={input} className="flex items-center gap-1.5 -ml-4">
							<div
								className={`w-2 h-2 rounded-full border-2 ${
									hasInputConnection(input)
										? `${dotColors[nodeType.color]} border-surgent-bg`
										: "bg-surgent-bg border-surgent-border"
								}`}
							/>
							<span className="text-[8px] text-surgent-text-3">{input}</span>
						</div>
					))}

					{/* Output ports */}
					{node.outputs.map((output) => (
						<div
							key={output}
							className="flex items-center justify-end gap-1.5 -mr-4"
						>
							<span className="text-[8px] text-surgent-text-3">{output}</span>
							<div
								className={`w-2 h-2 rounded-full border-2 ${
									hasOutputConnection(output)
										? `${dotColors[nodeType.color]} border-surgent-bg`
										: "bg-surgent-bg border-surgent-border"
								}`}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function ConnectionLine({
	from,
	to,
	nodes,
}: {
	from: { nodeId: string; port: string };
	to: { nodeId: string; port: string };
	nodes: WorkflowNode[];
}) {
	const fromNode = nodes.find((n) => n.id === from.nodeId);
	const toNode = nodes.find((n) => n.id === to.nodeId);
	if (!fromNode || !toNode) return null;

	const fromX = fromNode.x + 140;
	const fromPortIndex = fromNode.outputs.indexOf(from.port);
	const fromY =
		fromNode.y + 32 + fromNode.inputs.length * 16 + fromPortIndex * 16 + 8;

	const toX = toNode.x;
	const toPortIndex = toNode.inputs.indexOf(to.port);
	const toY = toNode.y + 32 + toPortIndex * 16 + 8;

	const midX = (fromX + toX) / 2;

	return (
		<path
			d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
			fill="none"
			stroke="url(#connectionGradient)"
			strokeWidth="2"
			strokeLinecap="round"
		/>
	);
}

function WorkflowList({
	workflows,
	activeId,
	onSelect,
	onNew,
}: {
	workflows: SavedWorkflow[];
	activeId: string;
	onSelect: (id: string) => void;
	onNew: () => void;
}) {
	return (
		<div className="w-[180px] shrink-0 border-r border-surgent-border flex flex-col bg-surgent-bg">
			{/* Header */}
			<div className="flex items-center justify-between px-3 h-9 border-b border-surgent-border">
				<span className="text-[10px] font-medium text-surgent-text">
					Workflows
				</span>
				<button
					onClick={onNew}
					className="p-1 rounded-md text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2 transition-colors"
				>
					<Icons.Plus />
				</button>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto p-2 space-y-1.5">
				{workflows.map((wf) => (
					<button
						key={wf.id}
						onClick={() => onSelect(wf.id)}
						className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
							activeId === wf.id
								? "border-surgent-border bg-surgent-surface-2"
								: "border-surgent-border/50 hover:bg-surgent-surface/50 hover:border-surgent-border"
						}`}
					>
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-medium text-surgent-text truncate">
								{wf.name}
							</span>
							{wf.status === "active" && (
								<div className="w-1.5 h-1.5 rounded-full bg-surgent-accent shrink-0" />
							)}
						</div>
						<p className="text-[8px] text-surgent-text-3 truncate mt-0.5">
							{wf.description}
						</p>
						<div className="flex items-center gap-2 mt-1">
							<span className="text-[7px] text-surgent-text-3">
								{wf.nodeCount} nodes
							</span>
							<span className="text-[7px] text-surgent-text-3">
								{wf.lastEdited}
							</span>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}

function NodePalette({ onAddNode }: { onAddNode: (type: NodeType) => void }) {
	return (
		<div className="absolute bottom-0 left-0 right-0 z-10 border-t border-surgent-border bg-surgent-bg/95 backdrop-blur-sm">
			<div className="flex items-center gap-1 px-3 py-2">
				<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3 mr-2">
					Add
				</span>
				{(
					Object.entries(nodeTypes) as [
						NodeType,
						(typeof nodeTypes)[NodeType],
					][]
				).map(([type, config]) => (
					<button
						key={type}
						onClick={() => onAddNode(type)}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-surgent-border text-[9px] text-surgent-text-2 hover:bg-surgent-surface hover:text-surgent-text transition-colors"
					>
						<span className="text-surgent-text-3">{config.icon}</span>
						{config.label}
					</button>
				))}
			</div>
		</div>
	);
}

function NodeDetail({
	node,
	onClose,
	onUpdate,
}: {
	node: WorkflowNode;
	onClose: () => void;
	onUpdate: (config: Record<string, unknown>) => void;
}) {
	const nodeType = nodeTypes[node.type];

	return (
		<div className="flex h-full flex-col bg-surgent-bg">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-surgent-border px-3 h-8">
				<div className="flex items-center gap-2">
					<span className="text-surgent-text-3">{nodeType.icon}</span>
					<span className="text-[10px] font-medium text-surgent-text">
						{node.title}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="p-1 rounded text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2 transition-colors"
				>
					<Icons.Close />
				</button>
			</div>

			{/* Config */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				<div>
					<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Node Type
					</label>
					<p className="mt-1 text-[10px] text-surgent-text">{nodeType.label}</p>
				</div>

				{node.type === "prompt" && (
					<>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Model
							</label>
							<select className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none">
								<option>Claude Opus</option>
								<option>Claude Sonnet</option>
								<option>GPT-4</option>
							</select>
						</div>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Prompt Template
							</label>
							<textarea
								defaultValue={node.config.template as string}
								rows={4}
								className="mt-1 w-full rounded-md bg-surgent-surface border border-surgent-border px-2 py-1.5 text-[9px] text-surgent-text outline-none resize-none font-mono"
							/>
							<p className="mt-1 text-[7px] text-surgent-text-3">
								Use {"{{variable}}"} to reference inputs
							</p>
						</div>
					</>
				)}

				{node.type === "image" && (
					<>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Model
							</label>
							<select className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none">
								<option>Flux</option>
								<option>Flux Pro</option>
								<option>Flux Dev</option>
							</select>
						</div>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Style
							</label>
							<select className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none">
								<option>Professional</option>
								<option>Artistic</option>
								<option>Photorealistic</option>
								<option>Illustration</option>
							</select>
						</div>
					</>
				)}

				{node.type === "research" && (
					<>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Depth
							</label>
							<select className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none">
								<option>Quick</option>
								<option>Thorough</option>
								<option>Deep</option>
							</select>
						</div>
						<div>
							<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
								Max Sources
							</label>
							<input
								type="number"
								defaultValue={5}
								className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none"
							/>
						</div>
					</>
				)}

				{node.type === "input" && (
					<div>
						<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
							Default Value
						</label>
						<input
							type="text"
							defaultValue={node.config.value as string}
							className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none"
						/>
					</div>
				)}

				{node.type === "output" && (
					<div>
						<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
							Output Format
						</label>
						<select className="mt-1 w-full h-7 rounded-md bg-surgent-surface border border-surgent-border px-2 text-[9px] text-surgent-text outline-none">
							<option>Markdown</option>
							<option>HTML</option>
							<option>Plain Text</option>
							<option>JSON</option>
						</select>
					</div>
				)}

				{/* Inputs/Outputs info */}
				<div className="pt-2 border-t border-surgent-border">
					<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Connections
					</span>
					<div className="mt-1.5 space-y-1">
						{node.inputs.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="text-[8px] text-surgent-text-3">Inputs:</span>
								<div className="flex gap-1">
									{node.inputs.map((i) => (
										<span
											key={i}
											className="px-1.5 py-0.5 rounded bg-surgent-surface border border-surgent-border text-[7px] font-mono text-surgent-text-2"
										>
											{i}
										</span>
									))}
								</div>
							</div>
						)}
						{node.outputs.length > 0 && (
							<div className="flex items-center gap-2">
								<span className="text-[8px] text-surgent-text-3">Outputs:</span>
								<div className="flex gap-1">
									{node.outputs.map((o) => (
										<span
											key={o}
											className="px-1.5 py-0.5 rounded bg-surgent-surface border border-surgent-border text-[7px] font-mono text-surgent-text-2"
										>
											{o}
										</span>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Actions */}
			<div className="shrink-0 p-3 border-t border-surgent-border">
				<button
					type="button"
					className="w-full h-7 rounded-md border border-red-500/30 text-[9px] text-red-400 hover:bg-red-500/10 transition-colors"
				>
					Delete Node
				</button>
			</div>
		</div>
	);
}

export function WorkflowBuilder() {
	const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
	const [connections] = useState<Connection[]>(initialConnections);
	const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [activeWorkflowId, setActiveWorkflowId] = useState("wf1");
	const [workflows] = useState<SavedWorkflow[]>(savedWorkflows);
	const canvasRef = useRef<HTMLDivElement>(null);

	const activeWorkflow = workflows.find((w) => w.id === activeWorkflowId);

	const handleDrag = useCallback((id: string, x: number, y: number) => {
		setNodes((prev) =>
			prev.map((n) =>
				n.id === id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n
			)
		);
	}, []);

	const handleAddNode = (type: NodeType) => {
		// Get canvas center for new nodes
		const canvasWidth = canvasRef.current?.clientWidth || 800;
		const canvasHeight = canvasRef.current?.clientHeight || 500;
		const newNode: WorkflowNode = {
			id: Date.now().toString(),
			type,
			title: nodeTypes[type].label,
			x: (canvasWidth - 140) / 2,
			y: (canvasHeight - 80) / 2,
			config: {},
			inputs: type === "output" ? ["content"] : type === "input" ? [] : ["in"],
			outputs: type === "input" ? ["out"] : type === "output" ? [] : ["out"],
		};
		setNodes([...nodes, newNode]);
		setSelectedNode(newNode);
	};

	const handleRun = () => {
		setIsRunning(true);
		setTimeout(() => setIsRunning(false), 3000);
	};

	const handleNewWorkflow = () => {
		// Would create a new workflow
		console.log("Create new workflow");
	};

	return (
		<div className="flex h-full w-full bg-surgent-bg">
			{/* Workflow List */}
			<WorkflowList
				workflows={workflows}
				activeId={activeWorkflowId}
				onSelect={setActiveWorkflowId}
				onNew={handleNewWorkflow}
			/>

			{/* Main content */}
			<div className="flex-1 flex flex-col min-w-0">
				{/* Toolbar */}
				<div className="shrink-0 flex items-center gap-2 px-3 h-9 border-b border-surgent-border">
					<span className="text-[10px] font-medium text-surgent-text">
						{activeWorkflow?.name || "Untitled"}
					</span>
					<span className="text-[8px] text-surgent-text-3">
						{nodes.length} nodes
					</span>

					<div className="flex-1" />

					<button
						type="button"
						className="flex items-center gap-1 h-6 px-2 rounded-md border border-surgent-border text-[9px] text-surgent-text-3 hover:bg-surgent-surface transition-colors"
					>
						<Icons.Folder />
						Save
					</button>
					<button
						type="button"
						onClick={handleRun}
						disabled={isRunning}
						className="flex items-center gap-1.5 h-6 px-3 rounded-md bg-surgent-accent text-black text-[9px] font-medium hover:bg-surgent-accent/90 transition-colors disabled:opacity-50"
					>
						{isRunning ? (
							<>
								<div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
								Running...
							</>
						) : (
							<>
								<Icons.Play />
								Run Workflow
							</>
						)}
					</button>
				</div>

				{/* Content */}
				<div className="flex flex-1 min-h-0 overflow-hidden">
					{/* Canvas */}
					<div
						ref={canvasRef}
						className="flex-1 relative overflow-auto bg-black"
						style={{
							backgroundImage:
								"radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
							backgroundSize: "20px 20px",
						}}
						onClick={() => setSelectedNode(null)}
					>
						{/* Node palette */}
						<NodePalette onAddNode={handleAddNode} />

						{/* SVG for connections */}
						<svg className="absolute inset-0 w-full h-full pointer-events-none">
							<defs>
								<linearGradient
									id="connectionGradient"
									x1="0%"
									y1="0%"
									x2="100%"
									y2="0%"
								>
									<stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
									<stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
								</linearGradient>
							</defs>
							{connections.map((conn) => (
								<ConnectionLine
									key={conn.id}
									from={{ nodeId: conn.from, port: conn.fromPort }}
									to={{ nodeId: conn.to, port: conn.toPort }}
									nodes={nodes}
								/>
							))}
						</svg>

						{/* Nodes */}
						{nodes.map((node) => (
							<NodeComponent
								key={node.id}
								node={node}
								isSelected={selectedNode?.id === node.id}
								onSelect={() => setSelectedNode(node)}
								onDrag={handleDrag}
								connections={connections}
							/>
						))}

						{/* Running indicator */}
						{isRunning && (
							<div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-lg bg-surgent-surface border border-surgent-border">
								<div className="w-2 h-2 rounded-full bg-surgent-accent animate-pulse" />
								<span className="text-[10px] text-surgent-text">
									Executing workflow...
								</span>
								<span className="text-[9px] text-surgent-text-3">
									Step 2 of 5
								</span>
							</div>
						)}
					</div>

					{/* Detail panel */}
					{selectedNode && (
						<div className="w-[220px] shrink-0 border-l border-surgent-border">
							<NodeDetail
								node={selectedNode}
								onClose={() => setSelectedNode(null)}
								onUpdate={(config) => {
									setNodes((prev) =>
										prev.map((n) =>
											n.id === selectedNode.id ? { ...n, config } : n
										)
									);
								}}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
