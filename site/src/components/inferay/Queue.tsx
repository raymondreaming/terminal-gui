import React, { useState, useRef, useCallback } from "react";
import { Icons } from "./Icons";

type QueueItem = {
	id: string;
	prompt: string;
	model: string;
	status: "pending" | "running" | "completed" | "failed";
	output?: string;
	duration?: number;
	x: number;
	y: number;
};

const initialQueue: QueueItem[] = [
	{
		id: "1",
		prompt: "Analyze the current file for potential bugs",
		model: "claude-opus",
		status: "completed",
		output: "Found 3 potential issues...",
		duration: 4200,
		x: 60,
		y: 60,
	},
	{
		id: "2",
		prompt: "Refactor the handleSubmit function",
		model: "claude-opus",
		status: "completed",
		output: "Refactored into smaller functions...",
		duration: 6100,
		x: 60,
		y: 160,
	},
	{
		id: "3",
		prompt: "Add error handling for edge cases",
		model: "claude-sonnet",
		status: "running",
		x: 60,
		y: 260,
	},
	{
		id: "4",
		prompt: "Write unit tests for the refactored code",
		model: "claude-sonnet",
		status: "pending",
		x: 60,
		y: 360,
	},
	{
		id: "5",
		prompt: "Generate documentation comments",
		model: "claude-haiku",
		status: "pending",
		x: 60,
		y: 460,
	},
];

const models: Record<string, { name: string }> = {
	"claude-opus": { name: "Opus" },
	"claude-sonnet": { name: "Sonnet" },
	"claude-haiku": { name: "Haiku" },
};

function QueueNode({
	item,
	index,
	isSelected,
	onSelect,
	onDrag,
}: {
	item: QueueItem;
	index: number;
	isSelected: boolean;
	onSelect: () => void;
	onDrag: (id: string, x: number, y: number) => void;
}) {
	const model = models[item.model];
	const dragRef = useRef<{ startX: number; startY: number } | null>(null);

	const handleMouseDown = (e: React.MouseEvent) => {
		if (item.status !== "pending") return;
		e.stopPropagation();
		onSelect();
		dragRef.current = {
			startX: e.clientX - item.x,
			startY: e.clientY - item.y,
		};

		const handleMouseMove = (e: MouseEvent) => {
			if (dragRef.current) {
				onDrag(
					item.id,
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

	return (
		<div
			className={`absolute select-none ${item.status === "pending" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
			style={{ left: item.x, top: item.y }}
			onMouseDown={handleMouseDown}
			onClick={(e) => {
				e.stopPropagation();
				onSelect();
			}}
		>
			<div
				className={`w-[280px] rounded-lg border transition-all ${
					isSelected
						? "border-surgent-accent ring-1 ring-surgent-accent/30"
						: item.status === "running"
							? "border-surgent-text-3"
							: item.status === "completed"
								? "border-surgent-border"
								: item.status === "failed"
									? "border-red-500/50"
									: "border-surgent-border hover:border-surgent-text-3"
				} bg-surgent-surface`}
			>
				{/* Header */}
				<div className="flex items-center gap-2 px-3 py-2 border-b border-surgent-border/50">
					{/* Status indicator */}
					<div
						className={`w-2 h-2 rounded-full ${
							item.status === "completed"
								? "bg-emerald-500"
								: item.status === "running"
									? "bg-surgent-text-2 animate-pulse"
									: item.status === "failed"
										? "bg-red-500"
										: "bg-surgent-text-3"
						}`}
					/>
					{/* Index */}
					<span className="text-[8px] font-mono text-surgent-text-3 tabular-nums">
						{String(index + 1).padStart(2, "0")}
					</span>
					{/* Model */}
					<span className="text-[8px] text-surgent-text-3">{model?.name}</span>
					{/* Duration */}
					{item.duration && (
						<span className="ml-auto text-[8px] text-surgent-text-3 tabular-nums">
							{(item.duration / 1000).toFixed(1)}s
						</span>
					)}
					{item.status === "running" && (
						<span className="ml-auto text-[8px] text-surgent-text-3">
							Processing...
						</span>
					)}
					{item.status === "pending" && (
						<Icons.Move className="ml-auto text-surgent-text-3" />
					)}
				</div>

				{/* Content */}
				<div className="px-3 py-2">
					<p
						className={`text-[9px] leading-relaxed line-clamp-2 ${
							item.status === "completed"
								? "text-surgent-text-3"
								: "text-surgent-text"
						}`}
					>
						{item.prompt}
					</p>
				</div>

				{/* Output port */}
				<div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
					<div
						className={`w-3 h-3 rounded-full border-2 ${
							item.status === "completed"
								? "bg-surgent-surface border-emerald-500"
								: item.status === "running"
									? "bg-surgent-surface border-surgent-text-3"
									: "bg-surgent-bg border-surgent-border"
						}`}
					/>
				</div>

				{/* Input port */}
				{index > 0 && (
					<div className="absolute -top-1.5 left-1/2 -translate-x-1/2">
						<div
							className={`w-3 h-3 rounded-full border-2 ${
								item.status !== "pending"
									? "bg-surgent-surface border-surgent-text-3"
									: "bg-surgent-bg border-surgent-border"
							}`}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function ConnectionLine({ from, to }: { from: QueueItem; to: QueueItem }) {
	const fromX = from.x + 140;
	const fromY = from.y + 75;
	const toX = to.x + 140;
	const toY = to.y;

	const midY = (fromY + toY) / 2;

	return (
		<path
			d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
			fill="none"
			stroke={
				from.status === "completed"
					? "rgba(255,255,255,0.2)"
					: "rgba(255,255,255,0.1)"
			}
			strokeWidth="2"
			strokeLinecap="round"
		/>
	);
}

function QueueDetail({
	item,
	onClose,
	onRemove,
	onRetry,
}: {
	item: QueueItem;
	onClose: () => void;
	onRemove: () => void;
	onRetry: () => void;
}) {
	const model = models[item.model];

	return (
		<div className="flex h-full flex-col bg-surgent-bg">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-surgent-border px-3 h-8">
				<div className="flex items-center gap-2">
					<div
						className={`w-2 h-2 rounded-full ${
							item.status === "completed"
								? "bg-emerald-500"
								: item.status === "running"
									? "bg-surgent-text-2 animate-pulse"
									: item.status === "failed"
										? "bg-red-500"
										: "bg-surgent-text-3"
						}`}
					/>
					<span className="text-[10px] font-medium text-surgent-text capitalize">
						{item.status}
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

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-3 space-y-4">
				{/* Prompt */}
				<div>
					<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Prompt
					</span>
					<p className="mt-1.5 text-[10px] text-surgent-text leading-relaxed">
						{item.prompt}
					</p>
				</div>

				{/* Model */}
				<div>
					<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Model
					</span>
					<div className="mt-1.5 flex items-center gap-2">
						<span className="text-[10px] text-surgent-text">{model?.name}</span>
					</div>
				</div>

				{/* Output */}
				{item.output && (
					<div>
						<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
							Output Preview
						</span>
						<div className="mt-1.5 p-2 rounded-md bg-surgent-surface border border-surgent-border">
							<p className="text-[9px] text-surgent-text-2 leading-relaxed font-mono">
								{item.output}
							</p>
						</div>
					</div>
				)}

				{/* Duration */}
				{item.duration && (
					<div>
						<span className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
							Duration
						</span>
						<p className="mt-1 text-[10px] text-surgent-text tabular-nums">
							{(item.duration / 1000).toFixed(2)} seconds
						</p>
					</div>
				)}
			</div>

			{/* Actions */}
			<div className="shrink-0 p-3 border-t border-surgent-border">
				{item.status === "pending" && (
					<button
						type="button"
						onClick={onRemove}
						className="w-full h-7 rounded-md border border-red-500/30 text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-colors"
					>
						Remove from Queue
					</button>
				)}
				{item.status === "failed" && (
					<button
						type="button"
						onClick={onRetry}
						className="w-full h-7 rounded-md bg-surgent-surface-2 border border-surgent-border text-[10px] font-medium text-surgent-text hover:bg-surgent-accent hover:text-black hover:border-surgent-accent transition-colors"
					>
						Retry
					</button>
				)}
				{item.status === "completed" && (
					<button
						type="button"
						className="w-full h-7 rounded-md bg-surgent-surface-2 border border-surgent-border text-[10px] font-medium text-surgent-text hover:bg-surgent-accent hover:text-black hover:border-surgent-accent transition-colors"
					>
						View Full Output
					</button>
				)}
			</div>
		</div>
	);
}

function AddToQueuePanel({
	onClose,
	onAdd,
}: {
	onClose: () => void;
	onAdd: (prompt: string, model: string) => void;
}) {
	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState("claude-sonnet");

	const handleSubmit = () => {
		if (prompt.trim()) {
			onAdd(prompt.trim(), model);
			setPrompt("");
		}
	};

	return (
		<div className="flex h-full flex-col bg-surgent-bg">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-surgent-border px-3 h-8">
				<span className="text-[10px] font-medium text-surgent-text">
					Add to Queue
				</span>
				<button
					type="button"
					onClick={onClose}
					className="p-1 rounded text-surgent-text-3 hover:bg-surgent-surface hover:text-surgent-text-2 transition-colors"
				>
					<Icons.Close />
				</button>
			</div>

			{/* Form */}
			<div className="flex-1 overflow-y-auto p-3 space-y-3">
				<div>
					<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Prompt
					</label>
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="What should the AI do?"
						rows={4}
						className="mt-1 w-full rounded-md bg-surgent-surface border border-surgent-border px-2 py-1.5 text-[10px] text-surgent-text placeholder:text-surgent-text-3 outline-none focus:border-surgent-accent/50 resize-none"
					/>
				</div>

				<div>
					<label className="text-[8px] font-medium uppercase tracking-wide text-surgent-text-3">
						Model
					</label>
					<div className="mt-1.5 flex gap-1.5">
						{Object.entries(models).map(([id, m]) => (
							<button
								key={id}
								type="button"
								onClick={() => setModel(id)}
								className={`flex-1 h-7 rounded-md border text-[9px] font-medium transition-colors ${
									model === id
										? "border-surgent-accent bg-surgent-surface-2 text-surgent-text"
										: "border-surgent-border text-surgent-text-3 hover:border-surgent-text-3"
								}`}
							>
								{m.name}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="shrink-0 p-3 border-t border-surgent-border">
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!prompt.trim()}
					className="w-full h-7 rounded-md bg-surgent-surface-2 border border-surgent-border text-[10px] font-medium text-surgent-text hover:bg-surgent-accent hover:text-black hover:border-surgent-accent transition-colors disabled:opacity-50 disabled:hover:bg-surgent-surface-2 disabled:hover:text-surgent-text disabled:hover:border-surgent-border"
				>
					Add to Queue
				</button>
			</div>
		</div>
	);
}

export function Queue() {
	const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
	const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
	const [isAdding, setIsAdding] = useState(false);
	const [isRunning, setIsRunning] = useState(true);
	const canvasRef = useRef<HTMLDivElement>(null);

	const completedCount = queue.filter((q) => q.status === "completed").length;
	const pendingCount = queue.filter((q) => q.status === "pending").length;
	const runningItem = queue.find((q) => q.status === "running");

	const handleDrag = useCallback((id: string, x: number, y: number) => {
		setQueue((prev) =>
			prev.map((n) =>
				n.id === id ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n
			)
		);
	}, []);

	const handleAdd = (prompt: string, model: string) => {
		const lastItem = queue[queue.length - 1];
		const newItem: QueueItem = {
			id: Date.now().toString(),
			prompt,
			model,
			status: "pending",
			x: lastItem ? lastItem.x : 60,
			y: lastItem ? lastItem.y + 100 : 60,
		};
		setQueue([...queue, newItem]);
		setIsAdding(false);
	};

	const handleRemove = (id: string) => {
		setQueue(queue.filter((q) => q.id !== id));
		setSelectedItem(null);
	};

	const handleClose = () => {
		setSelectedItem(null);
		setIsAdding(false);
	};

	// Sort queue by y position for connection drawing
	const sortedQueue = [...queue].sort((a, b) => a.y - b.y);

	return (
		<div className="flex h-full w-full flex-col bg-surgent-bg">
			{/* Toolbar */}
			<div className="shrink-0 flex items-center gap-3 px-3 h-9 border-b border-surgent-border">
				<span className="text-[10px] font-medium text-surgent-text">Queue</span>
				<span className="text-[8px] text-surgent-text-3 tabular-nums">
					{completedCount}/{queue.length} completed
				</span>

				<div className="flex-1" />

				{/* Controls */}
				<button
					type="button"
					onClick={() => setIsRunning(!isRunning)}
					className={`flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${
						isRunning
							? "border-surgent-border bg-surgent-surface-2 text-surgent-text"
							: "border-surgent-border bg-surgent-surface text-surgent-text-3 hover:text-surgent-text-2"
					}`}
				>
					{isRunning ? <Icons.Pause /> : <Icons.Play />}
				</button>
				<button
					type="button"
					onClick={() => setIsAdding(true)}
					className="flex items-center gap-1 h-6 rounded-md border border-surgent-border bg-surgent-surface px-2 text-[9px] text-surgent-text-2 hover:bg-surgent-surface-2 transition-colors"
				>
					<Icons.Plus />
					Add
				</button>
			</div>

			{/* Content */}
			<div className="flex flex-1 min-h-0 overflow-hidden">
				{/* Canvas */}
				<div
					ref={canvasRef}
					className="flex-1 relative overflow-auto"
					style={{
						backgroundImage: `
							radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)
						`,
						backgroundSize: "24px 24px",
					}}
					onClick={handleClose}
				>
					{/* SVG for connections */}
					<svg className="absolute inset-0 w-full h-full pointer-events-none">
						{sortedQueue.map((item, index) => {
							if (index === 0) return null;
							const prevItem = sortedQueue[index - 1];
							return (
								<ConnectionLine
									key={`conn-${prevItem.id}-${item.id}`}
									from={prevItem}
									to={item}
								/>
							);
						})}
					</svg>

					{/* Nodes */}
					{queue.map((item, index) => (
						<QueueNode
							key={item.id}
							item={item}
							index={index}
							isSelected={selectedItem?.id === item.id}
							onSelect={() => {
								setIsAdding(false);
								setSelectedItem(item);
							}}
							onDrag={handleDrag}
						/>
					))}

					{/* Add placeholder at bottom */}
					<button
						type="button"
						onClick={() => setIsAdding(true)}
						className="absolute rounded-lg border border-dashed border-surgent-border w-[280px] py-3 text-[9px] text-surgent-text-3 hover:border-surgent-text-3 hover:text-surgent-text-2 transition-colors"
						style={{
							left: queue.length > 0 ? queue[queue.length - 1].x : 60,
							top: queue.length > 0 ? queue[queue.length - 1].y + 100 : 60,
						}}
					>
						+ Add to queue
					</button>

					{/* Status indicator */}
					{runningItem && (
						<div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-surgent-surface border border-surgent-border">
							<div className="w-2 h-2 rounded-full bg-surgent-text-2 animate-pulse" />
							<span className="text-[9px] text-surgent-text truncate max-w-[200px]">
								{runningItem.prompt}
							</span>
							<span className="text-[8px] text-surgent-text-3 tabular-nums">
								{pendingCount} remaining
							</span>
						</div>
					)}
				</div>

				{/* Detail panel */}
				{selectedItem && !isAdding && (
					<div className="w-[240px] shrink-0 border-l border-surgent-border">
						<QueueDetail
							item={selectedItem}
							onClose={handleClose}
							onRemove={() => handleRemove(selectedItem.id)}
							onRetry={() => console.log("Retry:", selectedItem.id)}
						/>
					</div>
				)}

				{/* Add panel */}
				{isAdding && (
					<div className="w-[240px] shrink-0 border-l border-surgent-border">
						<AddToQueuePanel onClose={handleClose} onAdd={handleAdd} />
					</div>
				)}
			</div>
		</div>
	);
}
