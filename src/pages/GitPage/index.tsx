import * as stylex from "@stylexjs/stylex";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
	loadStoredMessages,
	savePendingSend,
	saveStoredInput,
} from "../../components/chat/chat-session-store.ts";
import {
	ChangeFileSidebar,
	type SelectedFile,
} from "../../components/git/ChangeFileSidebar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { IconButton } from "../../components/ui/IconButton.tsx";
import {
	IconGitBranch,
	IconOpenAI,
	IconPlus,
	IconRobot,
	IconTerminal,
	IconX,
} from "../../components/ui/Icons.tsx";
import { useAgentSessions } from "../../hooks/useAgentSessions.ts";
import { useGitDiff } from "../../hooks/useGitDiff.ts";
import { type GitFileEntry, useGitStatus } from "../../hooks/useGitStatus.ts";
import type { AgentKind } from "../../lib/agents.ts";
import {
	buildCommitMessage,
	buildFilePrompt,
	buildRepoExplainPrompt,
	buildSummaryPrompt,
	type ChangeCheckpoint,
	checkpointKey,
	buildReviewPrompt as composeReviewPrompt,
	createChangeSignature,
	formatShortTime,
} from "../../lib/changes-workspace.ts";
import { createDiffDocumentFromHunkDiff } from "../../lib/diff-document.ts";
import { fetchJson, postJson } from "../../lib/fetch-json.ts";
import {
	readStoredJson,
	writeStoredJson,
	writeStoredValue,
} from "../../lib/stored-json.ts";
import {
	createGroupId,
	createTerminalPane,
	DEFAULT_FONT_FAMILY,
	DEFAULT_FONT_SIZE,
	DEFAULT_OPACITY,
	loadTerminalState,
	saveTerminalState,
} from "../../lib/terminal-utils.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { InlineDirectoryPicker } from "../Terminal/InlineDirectoryPicker.tsx";

const GitDiffView = lazy(() =>
	import("../Terminal/GitDiffView.tsx").then((m) => ({
		default: m.GitDiffView,
	}))
);

function persist(dirs: string[]) {
	writeStoredJson("git-watched-dirs", dirs);
}

interface StoredChatMessage {
	role?: string;
	content?: string;
}

export function GitPage() {
	const navigate = useNavigate();
	const [dirs, setDirs] = useState<string[]>(() =>
		readStoredJson<string[]>("git-watched-dirs", [])
	);
	const [activeCwd, setActiveCwd] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [pickerError, setPickerError] = useState<string | null>(null);
	const [actionMessage, setActionMessage] = useState<string | null>(null);
	const [actionBusy, setActionBusy] = useState<string | null>(null);
	const [fileViewMode, setFileViewMode] = useState<"path" | "tree">("path");
	const [agentActivityVersion, setAgentActivityVersion] = useState(0);
	const [openActionMenu, setOpenActionMenu] = useState<"repo" | "file" | null>(
		null
	);
	const { projects, refetch } = useGitStatus(dirs);
	const { sessions: liveAgentSessions } = useAgentSessions();
	const {
		diff,
		request: diffReq,
		loading: diffLoading,
		loadDiff,
		clear: clearDiff,
	} = useGitDiff();
	const project = useMemo(() => {
		if (activeCwd) {
			const found = projects.find((p) => p.cwd === activeCwd);
			if (found) return found;
		}
		return projects[0] || null;
	}, [projects, activeCwd]);
	const [selFile, setSelFile] = useState<SelectedFile | null>(null);
	const [checkpointVersion, setCheckpointVersion] = useState(0);
	const prevCwd = useRef<string | null>(null);
	const hasAutoSelected = useRef(false);
	useEffect(() => {
		if (!project || project.files.length === 0) return;
		const cwdChanged = project.cwd !== prevCwd.current;
		if (cwdChanged) {
			hasAutoSelected.current = false;
			prevCwd.current = project.cwd;
		}
		if (hasAutoSelected.current) return;
		hasAutoSelected.current = true;
		const f = project.files[0]!;
		setSelFile({ path: f.path, staged: f.staged });
		loadDiff({ cwd: project.cwd, file: f.path, staged: f.staged });
	}, [project, loadDiff]);
	const allFiles = useMemo(() => {
		if (!project) return [];
		const unstaged = project.files.filter((f) => !f.staged);
		const staged = project.files.filter((f) => f.staged);
		return [...unstaged, ...staged];
	}, [project]);
	const selectedFileEntry = useMemo(() => {
		if (!selFile || !project) return null;
		return (
			project.files.find(
				(file) => file.path === selFile.path && file.staged === selFile.staged
			) ?? null
		);
	}, [project, selFile]);
	const diffDocument = useMemo(() => {
		if (!diff || !diffReq || !project) return null;
		return createDiffDocumentFromHunkDiff({
			cwd: project.cwd,
			path: diffReq.file,
			staged: diffReq.staged,
			status: selectedFileEntry?.status ?? "M",
			diff,
		});
	}, [diff, diffReq, project, selectedFileEntry]);

	const selectFile = useCallback(
		(path: string, staged: boolean) => {
			if (!project) return;
			setSelFile({ path, staged });
			loadDiff({ cwd: project.cwd, file: path, staged });
		},
		[project?.cwd, loadDiff, project]
	);
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
			if (!project || allFiles.length === 0) return;
			if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

			e.preventDefault();
			const currentIdx = selFile
				? allFiles.findIndex(
						(f) => f.path === selFile.path && f.staged === selFile.staged
					)
				: -1;

			let nextIdx: number;
			if (e.key === "ArrowDown") {
				nextIdx = currentIdx >= allFiles.length - 1 ? 0 : currentIdx + 1;
			} else {
				nextIdx = currentIdx <= 0 ? allFiles.length - 1 : currentIdx - 1;
			}

			const next = allFiles[nextIdx]!;
			setSelFile({ path: next.path, staged: next.staged });
			loadDiff({ cwd: project.cwd, file: next.path, staged: next.staged });
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [project?.cwd, allFiles, selFile, loadDiff, project]);

	const switchRepo = useCallback(
		(cwd: string) => {
			prevCwd.current = null;
			hasAutoSelected.current = false;
			setActiveCwd(cwd);
			setSelFile(null);
			clearDiff();
			setPickerOpen(false);
			setPickerError(null);
		},
		[clearDiff]
	);

	const addRepo = useCallback(
		async (dir: string) => {
			if (!dir || dirs.includes(dir)) return;
			setPickerError(null);
			try {
				await fetchJson(`/api/git/status?cwd=${encodeURIComponent(dir)}`);
			} catch {
				setPickerError("Not a git repository");
				return;
			}
			const next = [...dirs, dir];
			setDirs(next);
			persist(next);
			setPickerOpen(false);
			setPickerError(null);
			prevCwd.current = null;
			setActiveCwd(dir);
		},
		[dirs]
	);

	const removeRepo = useCallback(
		(cwd: string) => {
			const next = dirs.filter((d) => d !== cwd);
			setDirs(next);
			persist(next);
			if (activeCwd === cwd) {
				prevCwd.current = null;
				setActiveCwd(next[0] || null);
			}
			setSelFile(null);
			clearDiff();
		},
		[dirs, activeCwd, clearDiff]
	);

	const closePicker = useCallback(() => {
		setPickerOpen(false);
		setPickerError(null);
	}, []);

	const staged = project?.files.filter((f) => f.staged) || [];
	const modified =
		project?.files.filter((f) => !f.staged && f.status !== "?") || [];
	const untracked = project?.files.filter((f) => f.status === "?") || [];

	// ── Commit state & git actions ──
	const [commitMessage, setCommitMessage] = useState("");
	const [isCommitting, setIsCommitting] = useState(false);
	const [amendMode, setAmendMode] = useState(false);

	const gitAction = useCallback(
		async (endpoint: string, body: object) => {
			await fetch(`/api/git/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			refetch();
		},
		[refetch]
	);

	const stageFile = useCallback(
		(file: string) =>
			project?.cwd && gitAction("stage", { cwd: project.cwd, file }),
		[project?.cwd, gitAction]
	);
	const unstageFile = useCallback(
		(file: string) =>
			project?.cwd && gitAction("unstage", { cwd: project.cwd, file }),
		[project?.cwd, gitAction]
	);
	const stageAll = useCallback(
		() => project?.cwd && gitAction("stage", { cwd: project.cwd }),
		[project?.cwd, gitAction]
	);
	const unstageAll = useCallback(
		() => project?.cwd && gitAction("unstage", { cwd: project.cwd }),
		[project?.cwd, gitAction]
	);

	const handleCommit = useCallback(async () => {
		if (!project?.cwd || !commitMessage.trim() || isCommitting) return;
		setIsCommitting(true);
		try {
			const res = await fetch("/api/git/commit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ cwd: project.cwd, message: commitMessage }),
			});
			const result = await res.json();
			if (result.success) {
				setCommitMessage("");
				refetch();
			}
		} finally {
			setIsCommitting(false);
		}
	}, [project?.cwd, commitMessage, isCommitting, refetch]);

	const changeSignature = useMemo(
		() => (project ? createChangeSignature(project.files) : ""),
		[project]
	);
	const latestCheckpoint = useMemo(() => {
		if (!project) return null;
		void checkpointVersion;
		return readStoredJson<ChangeCheckpoint | null>(
			checkpointKey(project.cwd),
			null
		);
	}, [project, checkpointVersion]);
	const dirtySinceCheckpoint = Boolean(
		project &&
		latestCheckpoint &&
		latestCheckpoint.signature !== changeSignature
	);
	const totalChanges =
		(project?.stagedCount ?? 0) +
		(project?.unstagedCount ?? 0) +
		(project?.untrackedCount ?? 0);
	const repoAgentActivity = useMemo(() => {
		if (!project) return null;
		void agentActivityVersion;
		const state = loadTerminalState();
		const panes = (state?.groups ?? [])
			.flatMap((group) => group.panes)
			.filter(
				(pane) =>
					pane.cwd === project.cwd &&
					pane.agentKind &&
					pane.agentKind !== "terminal"
			);
		const pane = panes[panes.length - 1];
		if (!pane) return null;
		const messages = loadStoredMessages<StoredChatMessage>(pane.id);
		const latestPrompt = [...messages]
			.reverse()
			.find((message) => message.role === "user" && message.content?.trim());
		const liveSession = liveAgentSessions.find(
			(session) => session.paneId === pane.id
		);
		return {
			agentKind: pane.agentKind,
			latestPrompt: latestPrompt?.content?.trim() ?? "",
			status: liveSession?.isRunning ? "running" : "idle",
		};
	}, [project, agentActivityVersion, liveAgentSessions]);

	const refreshProject = useCallback(async () => {
		setActionBusy("refresh");
		try {
			await refetch();
			if (project && selFile) {
				loadDiff({
					cwd: project.cwd,
					file: selFile.path,
					staged: selFile.staged,
				});
			}
			setActionMessage("Refreshed");
		} finally {
			setActionBusy(null);
		}
	}, [refetch, project, selFile, loadDiff]);

	const openPane = useCallback(
		(agentKind: AgentKind, initialInput?: string, autoSend = false) => {
			if (!project) return null;
			const existing = loadTerminalState();
			const groups = existing?.groups ?? [
				{
					id: createGroupId(),
					name: "Default",
					panes: [],
					selectedPaneId: null,
					columns: 2,
					rows: 1,
				},
			];
			const selectedGroupId =
				existing?.selectedGroupId ?? groups[0]?.id ?? null;
			if (!selectedGroupId) return null;
			const pane = createTerminalPane(agentKind, project.cwd);
			if (initialInput && agentKind !== "terminal") {
				if (autoSend) {
					savePendingSend(pane.id, initialInput);
				} else {
					saveStoredInput(pane.id, initialInput);
				}
			}
			saveTerminalState({
				groups: groups.map((group) =>
					group.id === selectedGroupId
						? {
								...group,
								panes: [...group.panes, pane],
								selectedPaneId: pane.id,
							}
						: group
				),
				selectedGroupId,
				themeId: existing?.themeId ?? ("default" as const),
				fontSize: existing?.fontSize ?? DEFAULT_FONT_SIZE,
				fontFamily: existing?.fontFamily ?? DEFAULT_FONT_FAMILY,
				opacity: existing?.opacity ?? DEFAULT_OPACITY,
			});
			window.dispatchEvent(new Event("terminal-shell-change"));
			setAgentActivityVersion((version) => version + 1);
			navigate("/terminal");
			return pane;
		},
		[navigate, project]
	);

	const openEditor = useCallback(() => {
		if (!project) return;
		const pane = openPane("terminal");
		if (pane) {
			writeStoredValue("terminal-main-view", "editor");
			writeStoredValue("editor-selected-pane", pane.id);
			window.dispatchEvent(new Event("terminal-shell-change"));
		}
	}, [openPane, project]);

	const openNativePath = useCallback(async (path: string, reveal = false) => {
		setActionBusy(reveal ? "reveal" : "open-path");
		try {
			await postJson<{ ok: boolean }>("/api/native/open-path", {
				path,
				reveal,
			});
			setActionMessage(reveal ? "Opened in Finder" : "Opened file");
		} catch {
			setActionMessage(reveal ? "Could not open Finder" : "Could not open");
		} finally {
			setActionBusy(null);
		}
	}, []);

	const copyText = useCallback(async (text: string, message: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setActionMessage(message);
		} catch {
			setActionMessage("Copy failed");
		}
	}, []);

	const loadReviewPrompt = useCallback(async () => {
		if (!project) return;
		const diffs = await Promise.all(
			project.files.map(async (file) => {
				const result = await fetchJson<{ diff: string }>(
					`/api/git/diff?cwd=${encodeURIComponent(project.cwd)}&file=${encodeURIComponent(file.path)}&staged=${file.staged}`
				);
				return { file, diff: result.diff };
			})
		);
		return composeReviewPrompt(project, diffs);
	}, [project]);

	const copyReviewPrompt = useCallback(async () => {
		setActionBusy("review-prompt");
		try {
			const prompt = await loadReviewPrompt();
			if (!prompt) return;
			await copyText(prompt, "Review prompt copied");
		} catch {
			setActionMessage("Could not build review prompt");
		} finally {
			setActionBusy(null);
		}
	}, [loadReviewPrompt, copyText]);

	const summarizeChanges = useCallback(async () => {
		if (!project) return;
		setActionBusy("summary");
		try {
			const prompt = await loadReviewPrompt();
			if (!prompt) return;
			const summaryPrompt = buildSummaryPrompt(project, prompt);
			openPane("claude", summaryPrompt, true);
			setActionMessage("Summary requested");
		} catch {
			setActionMessage("Could not summarize changes");
		} finally {
			setActionBusy(null);
		}
	}, [loadReviewPrompt, openPane, project]);

	const openReviewPane = useCallback(
		async (agentKind: "claude" | "codex", autoSend = false) => {
			setActionBusy(`review:${agentKind}`);
			try {
				const prompt = await loadReviewPrompt();
				if (!prompt) return;
				openPane(agentKind, prompt, autoSend);
				setActionMessage(autoSend ? "Review sent" : "Review draft opened");
			} catch {
				setActionMessage("Could not build review prompt");
			} finally {
				setActionBusy(null);
			}
		},
		[loadReviewPrompt, openPane]
	);

	const loadFilePrompt = useCallback(
		async (file: GitFileEntry, intent: "explain" | "fix") => {
			if (!project) return;
			const result = await fetchJson<{ diff: string }>(
				`/api/git/diff?cwd=${encodeURIComponent(project.cwd)}&file=${encodeURIComponent(file.path)}&staged=${file.staged}`
			);
			return buildFilePrompt(project, file, result.diff, intent);
		},
		[project]
	);

	const askAboutFile = useCallback(
		async (agentKind: "claude" | "codex", intent: "explain" | "fix") => {
			if (!selFile) return;
			setActionBusy(`file:${intent}:${agentKind}`);
			try {
				const prompt = await loadFilePrompt(selFile, intent);
				if (!prompt) return;
				openPane(agentKind, prompt, true);
				setActionMessage(
					intent === "fix" ? "Fix request sent" : "File question sent"
				);
			} catch {
				setActionMessage("Could not build file prompt");
			} finally {
				setActionBusy(null);
			}
		},
		[loadFilePrompt, openPane, selFile]
	);

	const copyCommitMessage = useCallback(async () => {
		if (!project) return;
		await copyText(buildCommitMessage(project), "Commit message copied");
	}, [project, copyText]);

	const createCheckpoint = useCallback(() => {
		if (!project) return;
		const checkpoint: ChangeCheckpoint = {
			id: crypto.randomUUID().slice(0, 8),
			cwd: project.cwd,
			timestamp: Date.now(),
			signature: changeSignature,
		};
		writeStoredJson(checkpointKey(project.cwd), checkpoint);
		setCheckpointVersion((version) => version + 1);
		setActionMessage(`Checkpoint ${checkpoint.id} created`);
	}, [project, changeSignature]);

	const explainRepo = useCallback(() => {
		if (!project) return;
		openPane("claude", buildRepoExplainPrompt(project), true);
		setActionMessage("Repo explanation requested");
	}, [openPane, project]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.tagName === "SELECT" ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey
			) {
				return;
			}
			if (event.key === "r") {
				event.preventDefault();
				void refreshProject();
			} else if (event.key === "R") {
				event.preventDefault();
				void openReviewPane("claude", true);
			} else if (event.key === "c") {
				event.preventDefault();
				void copyCommitMessage();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [copyCommitMessage, openReviewPane, refreshProject]);

	if (dirs.length === 0 && !pickerOpen) {
		return (
			<div {...stylex.props(styles.centerPage)}>
				<div {...stylex.props(styles.centerStack)}>
					<div {...stylex.props(styles.emptyIconBox)}>
						<IconGitBranch size={24} {...stylex.props(styles.mutedIcon)} />
					</div>
					<p {...stylex.props(styles.emptyTitle)}>No repositories</p>
					<p {...stylex.props(styles.emptyText)}>
						Add a local git repo to get started
					</p>
					<Button
						type="button"
						onClick={() => setPickerOpen(true)}
						variant="secondary"
						size="sm"
					>
						Add Repository
					</Button>
				</div>
			</div>
		);
	}

	if (dirs.length === 0 && pickerOpen) {
		return (
			<div {...stylex.props(styles.centerPage)}>
				<div>
					{pickerError && (
						<div {...stylex.props(styles.errorNotice)}>{pickerError}</div>
					)}
					<InlineDirectoryPicker
						onSelect={(p) => (p ? void addRepo(p) : closePicker())}
						onCancel={closePicker}
					/>
				</div>
			</div>
		);
	}

	return (
		<div {...stylex.props(styles.root)}>
			<div {...stylex.props(styles.topBar)}>
				<div {...stylex.props(styles.repoControls)}>
					<label className="sr-only" htmlFor="git-repo-select">
						Repository
					</label>
					<select
						id="git-repo-select"
						value={project?.cwd ?? ""}
						onChange={(event) => switchRepo(event.target.value)}
						{...stylex.props(styles.repoSelect)}
					>
						{projects.map((repo) => {
							const count =
								repo.stagedCount + repo.unstagedCount + repo.untrackedCount;
							return (
								<option key={repo.cwd} value={repo.cwd}>
									{repo.name}
									{count ? ` (${count})` : ""}
								</option>
							);
						})}
					</select>
					{project && dirs.length > 1 && (
						<IconButton
							type="button"
							title="Remove repository"
							onClick={() => removeRepo(project.cwd)}
							variant="ghost"
							size="xs"
						>
							<IconX size={10} />
						</IconButton>
					)}
				</div>
				<IconButton
					type="button"
					onClick={() => setPickerOpen(true)}
					variant="subtle"
					size="xs"
					className={stylex.props(styles.addRepoButton).className}
					title="Add repository"
				>
					<IconPlus size={9} />
				</IconButton>
				{project && (
					<>
						<div {...stylex.props(styles.divider)} />
						<IconGitBranch
							size={10}
							{...stylex.props(styles.mutedIcon, styles.shrink)}
						/>
						<span {...stylex.props(styles.branchText)}>{project.branch}</span>
						{project.ahead > 0 && (
							<span {...stylex.props(styles.addedText)}>+{project.ahead}</span>
						)}
						{project.behind > 0 && (
							<span {...stylex.props(styles.deletedText)}>
								-{project.behind}
							</span>
						)}
						{dirtySinceCheckpoint && (
							<span {...stylex.props(styles.dirtyPill)}>dirty</span>
						)}
					</>
				)}
				<span {...stylex.props(styles.spacer)} />
				{project && (
					<div {...stylex.props(styles.actionGroup)}>
						<ActionButton
							label="Review"
							variant="primary"
							disabled={
								project.files.length === 0 || actionBusy?.startsWith("review:")
							}
							onClick={() => void openReviewPane("claude", true)}
						/>
						<ActionButton
							label="Summary"
							disabled={project.files.length === 0 || actionBusy === "summary"}
							onClick={() => void summarizeChanges()}
						/>
						<div {...stylex.props(styles.divider)} />
						<IconButton
							type="button"
							title="Open terminal here"
							onClick={() => openPane("terminal")}
							variant="ghost"
							size="xs"
						>
							<IconTerminal size={10} />
						</IconButton>
						<IconButton
							type="button"
							title="Open Claude here"
							onClick={() => openPane("claude")}
							variant="ghost"
							size="xs"
						>
							<IconRobot size={10} />
						</IconButton>
						<IconButton
							type="button"
							title="Open Codex here"
							onClick={() => openPane("codex")}
							variant="ghost"
							size="xs"
						>
							<IconOpenAI size={10} />
						</IconButton>
						<ActionMenu
							label="More"
							open={openActionMenu === "repo"}
							onToggle={() =>
								setOpenActionMenu((value) => (value === "repo" ? null : "repo"))
							}
							items={[
								{
									label: "Refresh",
									disabled: actionBusy === "refresh",
									onSelect: () => void refreshProject(),
								},
								{
									label: "Copy branch",
									onSelect: () =>
										project.branch &&
										void copyText(project.branch, "Branch copied"),
								},
								{ label: "Open in Editor", onSelect: openEditor },
								{
									label: "Open in Finder",
									disabled: actionBusy === "reveal",
									onSelect: () => void openNativePath(project.cwd, false),
								},
								{
									label: "Draft review",
									disabled:
										project.files.length === 0 ||
										actionBusy?.startsWith("review:"),
									onSelect: () => void openReviewPane("claude"),
								},
								{
									label: "Copy review prompt",
									disabled:
										project.files.length === 0 ||
										actionBusy === "review-prompt",
									onSelect: () => void copyReviewPrompt(),
								},
								{
									label: "Copy commit message",
									disabled: project.files.length === 0,
									onSelect: () => void copyCommitMessage(),
								},
								{ label: "Create checkpoint", onSelect: createCheckpoint },
							]}
						/>
					</div>
				)}
			</div>

			<div {...stylex.props(styles.content)}>
				<div {...stylex.props(styles.mainPane)}>
					{pickerOpen ? (
						<div {...stylex.props(styles.centerPage)}>
							<div>
								{pickerError && (
									<div {...stylex.props(styles.errorNotice)}>{pickerError}</div>
								)}
								<InlineDirectoryPicker
									onSelect={(p) => (p ? void addRepo(p) : closePicker())}
									onCancel={closePicker}
								/>
							</div>
						</div>
					) : diffLoading ? (
						<div {...stylex.props(styles.centerPage)}>
							<div {...stylex.props(styles.loadingRow)}>
								<div {...stylex.props(styles.spinner)} />
								<span {...stylex.props(styles.loadingText)}>Loading...</span>
							</div>
						</div>
					) : diff && diffReq ? (
						<Suspense
							fallback={
								<div {...stylex.props(styles.centerPage)}>
									<div {...stylex.props(styles.loadingRow)}>
										<div {...stylex.props(styles.spinner)} />
										<span {...stylex.props(styles.loadingText)}>
											Loading diff viewer...
										</span>
									</div>
								</div>
							}
						>
							<GitDiffView
								diff={diff}
								filePath={diffReq.file}
								staged={diffReq.staged}
								loading={false}
								onClose={() => {
									clearDiff();
									setSelFile(null);
								}}
							/>
						</Suspense>
					) : (
						<div {...stylex.props(styles.centerPage, styles.centerPad)}>
							<div {...stylex.props(styles.emptyWorktree)}>
								<p {...stylex.props(styles.emptyMainText)}>
									{project
										? project.files.length === 0
											? "No worktree changes"
											: "Select a file to view changes"
										: "Add a repository"}
								</p>
								{project && (
									<div {...stylex.props(styles.emptyActions)}>
										<ActionButton
											label="Open terminal here"
											onClick={() => openPane("terminal")}
										/>
										<ActionButton
											label="Open Claude here"
											onClick={() => openPane("claude")}
										/>
										<ActionButton
											label="Open Codex here"
											onClick={() => openPane("codex")}
										/>
										<ActionButton label="Explain repo" onClick={explainRepo} />
									</div>
								)}
							</div>
						</div>
					)}
				</div>

				{project && (
					<div {...stylex.props(styles.fileSidebar)}>
						<ChangeFileSidebar
							cwd={project.cwd}
							fileViewMode={fileViewMode}
							onFileViewModeChange={setFileViewMode}
							mainViewMode="diff"
							modified={modified}
							untracked={untracked}
							staged={staged}
							selectedFile={selFile}
							onSelectFile={(file) => selectFile(file.path, file.staged)}
							onStageFile={stageFile}
							onUnstageFile={unstageFile}
							onStageAll={stageAll}
							onUnstageAll={unstageAll}
							hasProject={!!project}
							selectedCommitHash={null}
							commitDetailsLoading={false}
							commitDetails={null}
							files={project.files}
							branch={project.branch}
							commitMessage={commitMessage}
							onCommitMessageChange={setCommitMessage}
							onCommit={handleCommit}
							isCommitting={isCommitting}
							amendMode={amendMode}
							onAmendModeChange={setAmendMode}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function ActionButton({
	label,
	disabled,
	onClick,
	variant = "secondary",
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
	variant?: "primary" | "secondary";
}) {
	return (
		<Button
			type="button"
			disabled={disabled}
			onClick={onClick}
			variant={variant === "primary" ? "primary" : "secondary"}
			size="sm"
			className={
				stylex.props(
					styles.actionButton,
					variant === "primary" && styles.primaryActionButton
				).className
			}
		>
			{label}
		</Button>
	);
}

function ActionMenu({
	label,
	open,
	onToggle,
	items,
}: {
	label: string;
	open: boolean;
	onToggle: () => void;
	items: {
		label: string;
		disabled?: boolean;
		onSelect: () => void;
	}[];
}) {
	return (
		<div {...stylex.props(styles.menuRoot)}>
			<ActionButton label={label} onClick={onToggle} />
			{open && (
				<div {...stylex.props(styles.menu)}>
					{items.map((item) => (
						<button
							key={item.label}
							type="button"
							disabled={item.disabled}
							onClick={() => {
								onToggle();
								item.onSelect();
							}}
							{...stylex.props(styles.menuItem)}
						>
							{item.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

const styles = stylex.create({
	root: {
		display: "flex",
		height: "100%",
		flexDirection: "column",
		backgroundColor: color.background,
	},
	centerPage: {
		display: "flex",
		height: "100%",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: color.background,
	},
	centerPad: {
		paddingInline: controlSize._6,
	},
	centerStack: {
		textAlign: "center",
	},
	emptyIconBox: {
		display: "flex",
		width: "3.5rem",
		height: "3.5rem",
		alignItems: "center",
		justifyContent: "center",
		marginInline: "auto",
		marginBottom: controlSize._4,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: controlSize._3,
		backgroundColor: color.backgroundRaised,
	},
	mutedIcon: {
		color: color.textMuted,
	},
	shrink: {
		flexShrink: 0,
	},
	emptyTitle: {
		marginBottom: controlSize._1,
		color: color.textMain,
		fontSize: font.size_3,
	},
	emptyText: {
		marginBottom: controlSize._4,
		color: color.textMuted,
		fontSize: font.size_2,
	},
	errorNotice: {
		marginBottom: controlSize._2,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "rgba(248, 81, 73, 0.2)",
		borderRadius: controlSize._2,
		backgroundColor: "rgba(248, 81, 73, 0.05)",
		color: "var(--color-git-deleted)",
		fontSize: font.size_2,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
	},
	topBar: {
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBlock: "0.375rem",
		paddingInline: controlSize._3,
	},
	repoControls: {
		display: "flex",
		minWidth: 0,
		alignItems: "center",
		gap: controlSize._2,
	},
	repoSelect: {
		height: controlSize._6,
		minWidth: "160px",
		maxWidth: "240px",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: {
			default: color.border,
			":focus": color.textMuted,
		},
		borderRadius: "0.375rem",
		backgroundColor: color.backgroundRaised,
		color: color.textSoft,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
		outline: "none",
		paddingInline: controlSize._2,
		transitionProperty: "background-color, border-color",
		transitionDuration: "120ms",
		":hover": {
			backgroundColor: color.controlHover,
		},
	},
	addRepoButton: {
		width: controlSize._5,
		height: controlSize._5,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		backgroundColor: color.backgroundRaised,
	},
	divider: {
		width: 1,
		height: font.size_3,
		backgroundColor: "rgba(255, 255, 255, 0.06)",
	},
	branchText: {
		color: color.textMuted,
		fontSize: font.size_1,
	},
	addedText: {
		color: "var(--color-git-added)",
		fontSize: "0.5rem",
	},
	deletedText: {
		color: "var(--color-git-deleted)",
		fontSize: "0.5rem",
	},
	dirtyPill: {
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "rgba(234, 179, 8, 0.3)",
		borderRadius: "0.25rem",
		backgroundColor: "rgba(234, 179, 8, 0.1)",
		color: "var(--color-git-modified)",
		fontSize: "0.5rem",
		paddingBlock: "0.125rem",
		paddingInline: controlSize._1,
	},
	spacer: {
		flex: 1,
	},
	actionGroup: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._1,
	},
	content: {
		display: "flex",
		minHeight: 0,
		flex: 1,
		overflow: "hidden",
	},
	mainPane: {
		display: "flex",
		minWidth: 0,
		flex: 1,
		flexDirection: "column",
		overflow: "hidden",
	},
	loadingRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
	},
	spinner: {
		width: font.size_3,
		height: font.size_3,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.textMuted,
		borderTopColor: "transparent",
		borderRadius: "999px",
		animationName: stylex.keyframes({
			to: {
				transform: "rotate(360deg)",
			},
		}),
		animationDuration: "800ms",
		animationTimingFunction: "linear",
		animationIterationCount: "infinite",
	},
	loadingText: {
		color: color.textMuted,
		fontSize: "0.6875rem",
	},
	emptyWorktree: {
		display: "flex",
		maxWidth: "28rem",
		flexDirection: "column",
		alignItems: "center",
		gap: controlSize._3,
		textAlign: "center",
	},
	emptyMainText: {
		color: color.textMuted,
		fontSize: font.size_3,
	},
	emptyActions: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "center",
		gap: "0.375rem",
	},
	fileSidebar: {
		display: "flex",
		width: "14rem",
		flexShrink: 0,
		flexDirection: "column",
		borderLeftWidth: 1,
		borderLeftStyle: "solid",
		borderLeftColor: color.border,
		backgroundColor: color.background,
	},
	actionButton: {
		height: controlSize._5,
		borderRadius: "0.375rem",
		fontSize: "0.5rem",
		paddingInline: "0.375rem",
	},
	primaryActionButton: {
		borderColor: "rgba(29, 185, 84, 0.35)",
		backgroundColor: "rgba(29, 185, 84, 0.12)",
		color: color.textSoft,
		":hover": {
			backgroundColor: "rgba(29, 185, 84, 0.18)",
		},
	},
	menuRoot: {
		position: "relative",
	},
	menu: {
		position: "absolute",
		right: 0,
		top: controlSize._6,
		zIndex: 30,
		minWidth: "9rem",
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "0.375rem",
		backgroundColor: color.backgroundRaised,
		boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
	},
	menuItem: {
		display: "flex",
		width: "100%",
		height: controlSize._7,
		alignItems: "center",
		color: color.textMuted,
		fontSize: font.size_1,
		paddingInline: "0.625rem",
		textAlign: "left",
		transitionProperty: "background-color, color, opacity",
		transitionDuration: "120ms",
		backgroundColor: {
			default: "transparent",
			":hover": color.controlHover,
		},
		":hover": {
			color: color.textSoft,
		},
		":disabled": {
			opacity: 0.3,
			pointerEvents: "none",
		},
	},
});
