import { useEffect, useMemo, useState } from "react";
import type { GitProjectStatus } from "../../hooks/useGitStatus.ts";
import { DropdownButton } from "../ui/DropdownButton.tsx";
import { IconFolder, IconGitBranch } from "../ui/Icons.tsx";

interface FileSearchEntry {
	readonly name: string;
	readonly path: string;
	readonly isDir: boolean;
}

interface FileGraphNode {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly x: number;
	readonly y: number;
	readonly status: "normal" | "modified" | "added";
	readonly connections: readonly string[];
}

function cwdLabel(cwd: string) {
	const parts = cwd.split("/");
	return parts[parts.length - 1] || cwd;
}

function fileStatusType(
	project: GitProjectStatus | null,
	path: string
): FileGraphNode["status"] {
	const file = project?.files.find((entry) => entry.path === path);
	if (!file) return "normal";
	if (file.status === "?" || file.status === "A") return "added";
	return "modified";
}

function statusClasses(status: FileGraphNode["status"]) {
	if (status === "added") {
		return {
			border: "border-emerald-500/40",
			bg: "bg-emerald-500/10",
			dot: "bg-emerald-400",
		};
	}
	if (status === "modified") {
		return {
			border: "border-amber-500/40",
			bg: "bg-amber-500/10",
			dot: "bg-amber-400",
		};
	}
	return {
		border: "border-inferay-border",
		bg: "bg-inferay-surface",
		dot: "bg-inferay-text-3/60",
	};
}

function buildGraphNodes(
	project: GitProjectStatus | null,
	files: readonly FileSearchEntry[]
): FileGraphNode[] {
	const fileEntries = files.filter((entry) => !entry.isDir).slice(0, 32);
	if (fileEntries.length === 0) return [];

	const byDir = new Map<string, FileSearchEntry[]>();
	for (const file of fileEntries) {
		const dir = file.path.includes("/")
			? file.path.split("/").slice(0, -1).join("/")
			: ".";
		const bucket = byDir.get(dir) ?? [];
		bucket.push(file);
		byDir.set(dir, bucket);
	}

	const dirEntries = [...byDir.entries()].sort((a, b) =>
		a[0].localeCompare(b[0])
	);
	const nodes: FileGraphNode[] = [];
	const nodeMap = new Map<string, FileGraphNode>();

	dirEntries.forEach(([_dir, dirFiles], groupIndex) => {
		dirFiles.sort((a, b) => a.path.localeCompare(b.path));
		dirFiles.forEach((file, index) => {
			const column = groupIndex % 4;
			const columnGroup = Math.floor(groupIndex / 4);
			const x = 56 + column * 190 + (index % 2) * 18;
			const y = 48 + columnGroup * 210 + index * 52;
			const stem = file.name.replace(/\.[^.]+$/, "");
			const status = fileStatusType(project, file.path);

			const connections = new Set<string>();
			for (const other of dirFiles) {
				if (other.path !== file.path) connections.add(other.path);
			}
			for (const other of fileEntries) {
				if (other.path === file.path) continue;
				const otherStem = other.name.replace(/\.[^.]+$/, "");
				if (
					otherStem === stem ||
					(otherStem.startsWith(stem) && stem.length > 2) ||
					(stem.startsWith(otherStem) && otherStem.length > 2)
				) {
					connections.add(other.path);
				}
			}

			const node: FileGraphNode = {
				id: file.path,
				label: file.name,
				path: file.path,
				x,
				y,
				status,
				connections: [...connections].slice(0, 5),
			};
			nodes.push(node);
			nodeMap.set(node.id, node);
		});
	});

	return nodes.filter((node) => nodeMap.has(node.id));
}

export function ProjectFileGraphView({
	cwds,
	activeCwd,
	onSelectCwd,
	project,
}: {
	cwds: string[];
	activeCwd: string | null;
	onSelectCwd: (cwd: string) => void;
	project: GitProjectStatus | null;
}) {
	const [files, setFiles] = useState<FileSearchEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

	useEffect(() => {
		if (!activeCwd) {
			setFiles([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		void fetch(
			`/api/files/search?cwd=${encodeURIComponent(activeCwd)}&limit=50`
		)
			.then((response) => response.json())
			.then((data: { results?: FileSearchEntry[] }) => {
				if (cancelled) return;
				setFiles(data.results ?? []);
			})
			.catch(() => {
				if (!cancelled) setFiles([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [activeCwd]);

	const nodes = useMemo(
		() => buildGraphNodes(project, files),
		[project, files]
	);

	useEffect(() => {
		setSelectedNodeId((current) =>
			current && nodes.some((node) => node.id === current)
				? current
				: (nodes[0]?.id ?? null)
		);
	}, [nodes]);

	const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
	const selectedConnections = useMemo(
		() =>
			selectedNode
				? nodes.filter((node) => selectedNode.connections.includes(node.id))
				: [],
		[nodes, selectedNode]
	);

	if (!activeCwd) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<p className="text-sm text-inferay-text">
					Open a project directory in one of this group's panes to populate the
					file graph.
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full overflow-hidden">
			<div className="relative min-w-0 flex-1 overflow-hidden bg-black">
				<div
					className="absolute inset-0"
					style={{
						backgroundImage:
							"radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
						backgroundSize: "20px 20px",
					}}
				/>
				<div className="absolute left-4 top-4 z-10 flex items-center gap-2">
					<DropdownButton
						value={activeCwd}
						options={cwds.map((cwd) => ({
							id: cwd,
							label: cwdLabel(cwd),
							detail: cwd,
							icon: <IconFolder size={12} />,
						}))}
						onChange={onSelectCwd}
						minWidth={220}
						buttonClassName="h-7 rounded-lg border-inferay-border bg-inferay-surface px-2.5 text-[10px] font-medium hover:bg-inferay-surface-2"
						labelClassName="max-w-[140px] truncate text-[10px]"
					/>
					{project ? (
						<div className="flex h-7 items-center gap-1.5 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 text-[10px] text-inferay-text-2">
							<IconGitBranch size={11} />
							<span className="font-mono">{project.branch}</span>
						</div>
					) : null}
				</div>
				<div className="absolute inset-0 overflow-auto px-12 py-16">
					{loading ? (
						<div className="flex h-full items-center justify-center">
							<p className="text-[11px] text-inferay-text-3">
								Loading project files...
							</p>
						</div>
					) : nodes.length === 0 ? (
						<div className="flex h-full items-center justify-center">
							<p className="text-[11px] text-inferay-text-3">
								No files available for this project yet.
							</p>
						</div>
					) : (
						<div className="relative mx-auto h-[640px] min-w-[820px] max-w-[980px]">
							<svg
								aria-hidden="true"
								className="absolute inset-0 h-full w-full"
							>
								{nodes.flatMap((node) =>
									node.connections.map((targetId) => {
										const target = nodes.find((item) => item.id === targetId);
										if (!target) return null;
										const active =
											hoveredNodeId === node.id ||
											hoveredNodeId === targetId ||
											selectedNodeId === node.id ||
											selectedNodeId === targetId;
										return (
											<line
												key={`${node.id}-${targetId}`}
												x1={node.x + 56}
												y1={node.y + 16}
												x2={target.x + 56}
												y2={target.y + 16}
												stroke={
													active
														? "rgba(255,255,255,0.28)"
														: "rgba(255,255,255,0.1)"
												}
												strokeDasharray={active ? "none" : "4 4"}
												strokeWidth={active ? 1.5 : 1}
											/>
										);
									})
								)}
							</svg>
							{nodes.map((node) => {
								const styles = statusClasses(node.status);
								const selected = node.id === selectedNodeId;
								return (
									<button
										type="button"
										key={node.id}
										className={`absolute flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all ${
											selected
												? `${styles.border} ${styles.bg} shadow-[0_0_0_1px_rgba(255,255,255,0.05)]`
												: "border-inferay-border bg-inferay-surface hover:bg-inferay-surface-2"
										}`}
										style={{ left: node.x, top: node.y }}
										onClick={() => setSelectedNodeId(node.id)}
										onMouseEnter={() => setHoveredNodeId(node.id)}
										onMouseLeave={() => setHoveredNodeId(null)}
									>
										<div className={`h-2 w-2 rounded-full ${styles.dot}`} />
										<span className="whitespace-nowrap font-mono text-[10px] text-inferay-text">
											{node.label}
										</span>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</div>
			<div className="w-80 shrink-0 border-l border-inferay-border bg-inferay-surface/20">
				<div className="border-b border-inferay-border px-4 py-3">
					<p className="text-[11px] font-medium text-inferay-text">
						File Graph
					</p>
					<p className="text-[10px] text-inferay-text-3">
						{project?.name ?? cwdLabel(activeCwd)}
					</p>
				</div>
				<div className="space-y-4 overflow-y-auto p-4">
					{selectedNode ? (
						<>
							<div>
								<p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-inferay-text-3">
									Selected File
								</p>
								<p className="font-mono text-[11px] text-inferay-text">
									{selectedNode.label}
								</p>
								<p className="mt-1 break-all text-[10px] text-inferay-text-3">
									{selectedNode.path}
								</p>
							</div>
							<div>
								<p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-inferay-text-3">
									Status
								</p>
								<p className="text-[11px] capitalize text-inferay-text-2">
									{selectedNode.status}
								</p>
							</div>
							<div>
								<p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-inferay-text-3">
									Related Files
								</p>
								<div className="space-y-2">
									{selectedConnections.length > 0 ? (
										selectedConnections.map((node) => (
											<button
												type="button"
												key={node.id}
												onClick={() => setSelectedNodeId(node.id)}
												className="flex w-full items-center gap-2 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 py-2 text-left transition-colors hover:bg-inferay-surface-2"
											>
												<div
													className={`h-2 w-2 rounded-full ${statusClasses(node.status).dot}`}
												/>
												<div className="min-w-0">
													<p className="truncate font-mono text-[10px] text-inferay-text">
														{node.label}
													</p>
													<p className="truncate text-[9px] text-inferay-text-3">
														{node.path}
													</p>
												</div>
											</button>
										))
									) : (
										<p className="text-[10px] text-inferay-text-3">
											No related files detected yet.
										</p>
									)}
								</div>
							</div>
						</>
					) : (
						<p className="text-[11px] text-inferay-text-3">
							Select a file node to inspect its relationships.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
