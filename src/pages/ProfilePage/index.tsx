import * as stylex from "@stylexjs/stylex";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.tsx";
import { DropdownButton } from "../../components/ui/DropdownButton.tsx";
import {
	IconAlertTriangle,
	IconCheck,
	IconExternalLink,
	IconGitBranch,
	IconPlus,
	IconRefreshCw,
	IconTerminal,
	IconUser,
} from "../../components/ui/Icons.tsx";
import { Notice, Panel, PanelHeader } from "../../components/ui/Surface.tsx";
import { TextInput } from "../../components/ui/TextInput.tsx";
import { getAgentIcon } from "../../lib/agent-ui.tsx";
import {
	type ChatAgentKind,
	CODEX_REASONING_LEVELS,
	getAgentDefinition,
	loadDefaultChatSettings,
	saveDefaultChatSettings,
} from "../../lib/agents.ts";
import {
	loadAppThemeId,
	mapAppThemeToTerminalTheme,
} from "../../lib/app-theme.ts";
import type { ThemeId } from "../../lib/terminal-utils.ts";
import { color, controlSize, font } from "../../tokens.stylex.ts";
import { ONBOARDING_DONE_KEY } from "../OnboardingPage/index.tsx";
import { TerminalSettingsPanel } from "../Terminal/TerminalSettingsPanel.tsx";

interface ForgeAccount {
	provider: "github";
	host: string;
	login: string;
	name: string | null;
	avatarUrl: string | null;
	email: string | null;
	active: boolean;
}

interface GithubRepo {
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	updated_at: string;
	private: boolean;
}

type LoadState = "idle" | "loading" | "ready" | "error";
const PROFILE_CACHE_TTL_MS = 120_000;

let cachedAccounts: { value: ForgeAccount[]; cachedAt: number } | null = null;
let cachedRepos: { value: GithubRepo[]; cachedAt: number } | null = null;

function isFresh(cachedAt: number) {
	return Date.now() - cachedAt < PROFILE_CACHE_TTL_MS;
}

export function ProfilePage() {
	const navigate = useNavigate();
	const resetOnboarding = () => {
		localStorage.removeItem(ONBOARDING_DONE_KEY);
		navigate("/onboarding", { replace: true });
	};
	const [accounts, setAccounts] = useState<ForgeAccount[]>(
		cachedAccounts && isFresh(cachedAccounts.cachedAt)
			? cachedAccounts.value
			: []
	);
	const [loadState, setLoadState] = useState<LoadState>(
		cachedAccounts && isFresh(cachedAccounts.cachedAt) ? "ready" : "idle"
	);
	const [error, setError] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);
	const [repos, setRepos] = useState<GithubRepo[]>(
		cachedRepos && isFresh(cachedRepos.cachedAt) ? cachedRepos.value : []
	);
	const [reposLoading, setReposLoading] = useState(false);
	const [repoQuery, setRepoQuery] = useState("");
	const [cloneDirectory, setCloneDirectory] = useState("~/Desktop");
	const [cloneStatus, setCloneStatus] = useState<string | null>(null);
	const [cloningRepo, setCloningRepo] = useState<string | null>(null);
	const [showSettings, setShowSettings] = useState(false);
	const [themeId, setThemeId] = useState<ThemeId>(
		() => mapAppThemeToTerminalTheme(loadAppThemeId()) as ThemeId
	);
	const [defaultChatSettings, setDefaultChatSettings] = useState(() =>
		loadDefaultChatSettings()
	);
	const defaultAgentDefinition = getAgentDefinition(
		defaultChatSettings.agentKind
	);
	const defaultModelOptions = defaultAgentDefinition.models.map((option) => ({
		...option,
		icon: getAgentIcon(defaultChatSettings.agentKind, 12),
	}));

	const updateDefaultChatSettings = (
		next: Partial<typeof defaultChatSettings>
	) => {
		const merged = loadDefaultChatSettings();
		const settings = { ...merged, ...next };
		const normalized = {
			...settings,
			model: getAgentDefinition(settings.agentKind).models.some(
				(option) => option.id === settings.model
			)
				? settings.model
				: getAgentDefinition(settings.agentKind).defaultModel,
		};
		saveDefaultChatSettings(normalized);
		setDefaultChatSettings(loadDefaultChatSettings());
	};

	const loadAccounts = useCallback(async (force = false) => {
		if (!force && cachedAccounts && isFresh(cachedAccounts.cachedAt)) {
			setAccounts(cachedAccounts.value);
			setLoadState("ready");
			return;
		}
		if (force || !cachedAccounts || !isFresh(cachedAccounts.cachedAt)) {
			setLoadState("loading");
		}
		setError(null);
		try {
			const response = await fetch("/api/forge/accounts");
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const payload = (await response.json()) as { accounts?: ForgeAccount[] };
			const nextAccounts = Array.isArray(payload.accounts)
				? payload.accounts
				: [];
			cachedAccounts = { value: nextAccounts, cachedAt: Date.now() };
			setAccounts(nextAccounts);
			setLoadState("ready");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unable to load accounts");
			setLoadState("error");
		}
	}, []);

	useEffect(() => {
		void loadAccounts();
	}, [loadAccounts]);

	useEffect(() => {
		const handleSettingsOpen = () => setShowSettings(true);
		window.addEventListener("terminal-open-theme-panel", handleSettingsOpen);
		return () =>
			window.removeEventListener(
				"terminal-open-theme-panel",
				handleSettingsOpen
			);
	}, []);

	const loadRepos = useCallback(async (force = false) => {
		if (!force && cachedRepos && isFresh(cachedRepos.cachedAt)) {
			setRepos(cachedRepos.value);
			return;
		}
		setReposLoading(true);
		try {
			const response = await fetch("/api/forge/repos?limit=50");
			if (!response.ok) throw new Error(await response.text());
			const payload = (await response.json()) as { repos?: GithubRepo[] };
			const nextRepos = Array.isArray(payload.repos) ? payload.repos : [];
			cachedRepos = { value: nextRepos, cachedAt: Date.now() };
			setRepos(nextRepos);
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Unable to load GitHub repositories"
			);
		} finally {
			setReposLoading(false);
		}
	}, []);

	useEffect(() => {
		if (accounts.length > 0) {
			void loadRepos();
		}
	}, [accounts.length, loadRepos]);

	const activeAccount = useMemo(
		() => accounts.find((account) => account.active) ?? accounts[0] ?? null,
		[accounts]
	);

	const filteredRepos = useMemo(() => {
		const query = repoQuery.trim().toLowerCase();
		if (!query) return repos;
		return repos.filter(
			(repo) =>
				repo.full_name.toLowerCase().includes(query) ||
				repo.description?.toLowerCase().includes(query)
		);
	}, [repoQuery, repos]);

	const connectGithub = async () => {
		setConnecting(true);
		try {
			await fetch("/api/forge/connect", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider: "github" }),
			});
		} finally {
			setConnecting(false);
		}
	};

	const pickCloneDirectory = async () => {
		const response = await fetch("/api/config/pick-folder", { method: "POST" });
		const payload = (await response.json()) as { folder: string | null };
		if (payload.folder) setCloneDirectory(payload.folder);
	};

	const cloneRepo = async (repo: GithubRepo) => {
		setCloningRepo(repo.full_name);
		setCloneStatus(null);
		setError(null);
		try {
			const response = await fetch("/api/forge/clone", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					gitUrl: repo.html_url,
					cloneDirectory,
				}),
			});
			const payload = (await response.json()) as {
				error?: string;
				displayPath?: string;
			};
			if (!response.ok) throw new Error(payload.error ?? "Clone failed");
			cachedRepos = null;
			setCloneStatus(`Cloned ${repo.full_name} to ${payload.displayPath}`);
			window.dispatchEvent(new Event("terminal-shell-change"));
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Unable to clone repository"
			);
		} finally {
			setCloningRepo(null);
		}
	};

	return (
		<div {...stylex.props(styles.root)}>
			<main {...stylex.props(styles.main)}>
				<div {...stylex.props(styles.content)}>
					<section {...stylex.props(styles.profileSummary)}>
						<div {...stylex.props(styles.accountPreview)}>
							<AccountAvatar account={activeAccount} size="md" />
							<div {...stylex.props(styles.rowText)}>
								<p {...stylex.props(styles.profileName)}>
									{activeAccount?.name ||
										activeAccount?.login ||
										"GitHub Account"}
								</p>
								<p {...stylex.props(styles.profileMeta)}>
									{activeAccount ? `@${activeAccount.login}` : "Not connected"}
								</p>
							</div>
						</div>
						<div {...stylex.props(styles.profileActionCards)}>
							{!activeAccount ? (
								<button
									type="button"
									onClick={connectGithub}
									disabled={connecting}
									{...stylex.props(styles.profileActionCard)}
								>
									<span {...stylex.props(styles.profileActionIcon)}>
										<IconTerminal size={14} />
									</span>
									<span {...stylex.props(styles.profileActionTextGroup)}>
										<span {...stylex.props(styles.profileActionTitle)}>
											{connecting ? "Opening..." : "Connect GitHub"}
										</span>
										<span {...stylex.props(styles.profileActionText)}>
											Use your local GitHub CLI login.
										</span>
									</span>
								</button>
							) : null}
							<button
								type="button"
								onClick={resetOnboarding}
								{...stylex.props(styles.profileActionCard)}
							>
								<span {...stylex.props(styles.profileActionIcon)}>
									<IconRefreshCw size={14} />
								</span>
								<span {...stylex.props(styles.profileActionTextGroup)}>
									<span {...stylex.props(styles.profileActionTitle)}>
										Replay Onboarding
									</span>
									<span {...stylex.props(styles.profileActionText)}>
										Reset setup and walk through it again.
									</span>
								</span>
							</button>
						</div>
					</section>

					<Panel>
						<PanelHeader
							title="New Chat Defaults"
							description="Choose which agent, model, and reasoning level new panes use when you press New."
						/>
						<div {...stylex.props(styles.defaultSettingsGrid)}>
							<div {...stylex.props(styles.settingField)}>
								<span {...stylex.props(styles.settingLabel)}>Agent</span>
								<DropdownButton
									value={defaultChatSettings.agentKind}
									options={(["claude", "codex"] as const).map((kind) => ({
										id: kind,
										label: getAgentDefinition(kind).label,
										icon: getAgentIcon(kind, 12),
									}))}
									onChange={(id) => {
										const agentKind = id as ChatAgentKind;
										updateDefaultChatSettings({
											agentKind,
											model: getAgentDefinition(agentKind).defaultModel,
										});
									}}
									fullWidth
								/>
							</div>
							<div {...stylex.props(styles.settingField)}>
								<span {...stylex.props(styles.settingLabel)}>Model</span>
								<DropdownButton
									value={defaultChatSettings.model}
									options={defaultModelOptions}
									onChange={(model) => updateDefaultChatSettings({ model })}
									fullWidth
								/>
							</div>
							{defaultChatSettings.agentKind === "codex" ? (
								<div {...stylex.props(styles.settingField)}>
									<span {...stylex.props(styles.settingLabel)}>Reasoning</span>
									<DropdownButton
										value={defaultChatSettings.reasoningLevel}
										options={CODEX_REASONING_LEVELS.map((level) => ({
											id: level.id,
											label: level.label,
											detail: level.detail,
										}))}
										onChange={(reasoningLevel) =>
											updateDefaultChatSettings({ reasoningLevel })
										}
										fullWidth
									/>
								</div>
							) : null}
						</div>
					</Panel>

					<header {...stylex.props(styles.header)}>
						<div>
							<h1 {...stylex.props(styles.title)}>GitHub</h1>
							<p {...stylex.props(styles.description)}>
								Inferay uses your local GitHub CLI login for repositories.
							</p>
						</div>
						<div {...stylex.props(styles.headerActions)}>
							<Button
								type="button"
								onClick={() => void loadAccounts(true)}
								variant="secondary"
								size="sm"
							>
								<IconRefreshCw size={12} />
								<span>Refresh</span>
							</Button>
							{!activeAccount ? (
								<Button
									type="button"
									onClick={connectGithub}
									variant="primary"
									size="sm"
								>
									<IconTerminal size={12} />
									<span>Connect</span>
								</Button>
							) : null}
						</div>
					</header>

					{error ? <ErrorBanner message={error} /> : null}
					{cloneStatus ? <SuccessBanner message={cloneStatus} /> : null}

					{loadState === "loading" || accounts.length === 0 ? (
						<Panel>
							{loadState === "loading" ? (
								<div {...stylex.props(styles.accountLoadingState)}>
									Checking GitHub CLI account...
								</div>
							) : (
								<EmptyState onConnect={connectGithub} />
							)}
						</Panel>
					) : null}

					{accounts.length > 0 ? (
						<Panel>
							<PanelHeader
								title="Clone from GitHub"
								description="Discover repositories from your connected account and add the clone location to Inferay search."
								actions={
									<Button
										type="button"
										onClick={() => void loadRepos(true)}
										variant="secondary"
										size="sm"
										className={stylex.props(styles.noShrink).className}
									>
										<IconRefreshCw size={12} />
										<span>Repos</span>
									</Button>
								}
							/>
							<div {...stylex.props(styles.cloneControls)}>
								<TextInput
									type="text"
									value={repoQuery}
									onChange={(event) => setRepoQuery(event.target.value)}
									placeholder="Search repositories"
									fullWidth
									className={stylex.props(styles.flexInput).className}
								/>
								<div {...stylex.props(styles.cloneDirControls)}>
									<TextInput
										type="text"
										value={cloneDirectory}
										onChange={(event) => setCloneDirectory(event.target.value)}
										fullWidth
										className={stylex.props(styles.flexInput).className}
									/>
									<Button
										type="button"
										onClick={() => void pickCloneDirectory()}
										variant="ghost"
										size="md"
										className={stylex.props(styles.noShrink).className}
									>
										Browse
									</Button>
								</div>
							</div>
							<div {...stylex.props(styles.repoList)}>
								{reposLoading ? (
									<div {...stylex.props(styles.loadingState)}>
										Loading repositories...
									</div>
								) : filteredRepos.length === 0 ? (
									<div {...stylex.props(styles.loadingState)}>
										No repositories found.
									</div>
								) : (
									filteredRepos.map((repo) => (
										<RepoRow
											key={repo.full_name}
											repo={repo}
											cloning={cloningRepo === repo.full_name}
											onClone={() => void cloneRepo(repo)}
										/>
									))
								)}
							</div>
						</Panel>
					) : null}
				</div>
			</main>
			{showSettings ? (
				<TerminalSettingsPanel
					themeId={themeId}
					onThemeChange={(nextThemeId: ThemeId) => setThemeId(nextThemeId)}
					onClose={() => setShowSettings(false)}
				/>
			) : null}
		</div>
	);
}

function RepoRow({
	repo,
	cloning,
	onClone,
}: {
	repo: GithubRepo;
	cloning: boolean;
	onClone: () => void;
}) {
	return (
		<div {...stylex.props(styles.repoRow)}>
			<div {...stylex.props(styles.rowText)}>
				<div {...stylex.props(styles.inlineRow)}>
					<p {...stylex.props(styles.repoName)}>{repo.full_name}</p>
					{repo.private ? (
						<span {...stylex.props(styles.privatePill)}>Private</span>
					) : null}
				</div>
				<p {...stylex.props(styles.repoDescription)}>
					{repo.description || repo.language || "No description"}
				</p>
			</div>
			<a
				href={repo.html_url}
				target="_blank"
				rel="noreferrer"
				{...stylex.props(styles.externalLink)}
				title="Open on GitHub"
			>
				<IconExternalLink size={12} />
			</a>
			<Button
				type="button"
				onClick={onClone}
				disabled={cloning}
				variant="primary"
				size="sm"
			>
				<IconPlus size={12} />
				<span>{cloning ? "Cloning" : "Clone"}</span>
			</Button>
		</div>
	);
}

function AccountAvatar({
	account,
	size,
}: {
	account: ForgeAccount | null;
	size: "md" | "lg";
}) {
	const fallback = account?.login.slice(0, 2).toUpperCase() || "GH";

	return (
		<div
			{...stylex.props(
				styles.avatar,
				size === "lg" ? styles.avatarLg : styles.avatarMd
			)}
		>
			{account?.avatarUrl ? (
				<img
					src={account.avatarUrl}
					alt={account.login}
					{...stylex.props(styles.avatarImage)}
				/>
			) : account ? (
				fallback
			) : (
				<IconUser size={18} />
			)}
		</div>
	);
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
	return (
		<div {...stylex.props(styles.emptyState)}>
			<div {...stylex.props(styles.emptyIcon)}>
				<IconGitBranch size={17} />
			</div>
			<div>
				<p {...stylex.props(styles.emptyTitle)}>No GitHub accounts found</p>
				<p {...stylex.props(styles.emptyText)}>
					Connect with the GitHub CLI and Inferay will pick up the account
					automatically.
				</p>
			</div>
			<Button type="button" onClick={onConnect} variant="primary" size="sm">
				<IconTerminal size={12} />
				<span>Run gh auth login</span>
			</Button>
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<Notice tone="warning" icon={<IconAlertTriangle size={13} />}>
			{message}
		</Notice>
	);
}

function SuccessBanner({ message }: { message: string }) {
	return (
		<Notice tone="success" icon={<IconCheck size={13} />}>
			{message}
		</Notice>
	);
}

const styles = stylex.create({
	root: {
		display: "flex",
		height: "100%",
		minHeight: 0,
		backgroundColor: color.background,
	},
	sidebar: {
		display: "flex",
		width: "220px",
		flexShrink: 0,
		flexDirection: "column",
		borderRightWidth: 1,
		borderRightStyle: "solid",
		borderRightColor: color.border,
		backgroundColor: color.background,
	},
	sidebarHeader: {
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBlock: controlSize._4,
		paddingInline: controlSize._4,
	},
	accountPreview: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._3,
	},
	rowText: {
		minWidth: 0,
		flex: 1,
	},
	profileSummary: {
		display: "flex",
		alignItems: {
			default: "flex-start",
			"@media (min-width: 720px)": "center",
		},
		justifyContent: "space-between",
		gap: controlSize._3,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBottom: controlSize._4,
	},
	profileActionCards: {
		display: "grid",
		gridTemplateColumns: {
			default: "1fr",
			"@media (min-width: 720px)": "repeat(2, minmax(0, 1fr))",
		},
		gap: controlSize._2,
		minWidth: {
			default: "100%",
			"@media (min-width: 720px)": "360px",
		},
	},
	profileActionCard: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._3,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: controlSize._2,
		backgroundColor: {
			default: color.backgroundRaised,
			":hover": color.controlActive,
		},
		padding: controlSize._3,
		textAlign: "left",
		transitionProperty: "background-color, opacity",
		transitionDuration: "120ms",
		":disabled": {
			cursor: "default",
			opacity: 0.7,
		},
	},
	profileActionIcon: {
		display: "flex",
		width: controlSize._7,
		height: controlSize._7,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: controlSize._2,
		backgroundColor: color.background,
		color: color.textSoft,
	},
	profileActionTextGroup: {
		display: "flex",
		minWidth: 0,
		flexDirection: "column",
	},
	profileActionTitle: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: font.size_3,
		fontWeight: font.weight_5,
	},
	profileActionText: {
		marginTop: "0.125rem",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: font.size_1,
	},
	profileName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: "0.8125rem",
		fontWeight: font.weight_5,
	},
	profileMeta: {
		marginTop: "0.125rem",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: font.size_2,
	},
	defaultSettingsGrid: {
		display: "grid",
		gridTemplateColumns: {
			default: "1fr",
			"@media (min-width: 760px)": "repeat(3, minmax(0, 1fr))",
		},
		gap: controlSize._3,
		padding: controlSize._4,
	},
	settingField: {
		display: "flex",
		minWidth: 0,
		flexDirection: "column",
		gap: controlSize._1,
	},
	settingLabel: {
		color: color.textMuted,
		fontSize: font.size_1,
		fontWeight: font.weight_5,
	},
	sidebarName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
	},
	sidebarMeta: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: "0.5rem",
	},
	nav: {
		flex: 1,
		paddingBlock: controlSize._3,
		paddingInline: controlSize._3,
	},
	navItem: {
		display: "flex",
		width: "100%",
		height: controlSize._8,
		alignItems: "center",
		gap: controlSize._2,
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: controlSize._2,
		backgroundColor: color.controlActive,
		color: color.textMain,
		fontSize: font.size_2,
		paddingInline: "0.625rem",
	},
	mutedIcon: {
		color: color.textMuted,
	},
	navCount: {
		marginLeft: "auto",
		color: color.textMuted,
		fontSize: "0.5rem",
		fontVariantNumeric: "tabular-nums",
	},
	sidebarActions: {
		display: "flex",
		flexDirection: "column",
		gap: controlSize._2,
		borderTopWidth: 1,
		borderTopStyle: "solid",
		borderTopColor: color.border,
		padding: controlSize._3,
	},
	fullWidth: {
		width: "100%",
	},
	noShrink: {
		flexShrink: 0,
	},
	flexInput: {
		flex: 1,
	},
	main: {
		minWidth: 0,
		flex: 1,
		overflowY: "auto",
	},
	content: {
		display: "flex",
		maxWidth: "56rem",
		flexDirection: "column",
		gap: controlSize._4,
		marginInline: "auto",
		paddingBlock: controlSize._5,
		paddingInline: controlSize._6,
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: controlSize._3,
	},
	title: {
		color: color.textMain,
		fontSize: "0.8125rem",
		fontWeight: font.weight_5,
	},
	description: {
		marginTop: controlSize._1,
		color: color.textMuted,
		fontSize: font.size_1,
	},
	headerActions: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
	},
	cloneControls: {
		display: "flex",
		flexDirection: {
			default: "column",
			"@media (min-width: 768px)": "row",
		},
		gap: controlSize._2,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBlock: controlSize._3,
		paddingInline: controlSize._4,
	},
	cloneDirControls: {
		display: "flex",
		minWidth: 0,
		alignItems: "center",
		gap: controlSize._2,
		width: {
			default: "auto",
			"@media (min-width: 768px)": "320px",
		},
	},
	repoList: {
		maxHeight: "320px",
		overflowY: "auto",
	},
	loadingState: {
		display: "flex",
		height: "6rem",
		alignItems: "center",
		justifyContent: "center",
		color: color.textMuted,
		fontSize: font.size_2,
	},
	accountLoadingState: {
		display: "flex",
		height: "7rem",
		alignItems: "center",
		justifyContent: "center",
		color: color.textMuted,
		fontSize: "0.625rem",
	},
	repoRow: {
		display: "flex",
		minHeight: "64px",
		alignItems: "center",
		gap: controlSize._3,
		borderBottomWidth: 1,
		borderBottomStyle: "solid",
		borderBottomColor: color.border,
		paddingBlock: controlSize._3,
		paddingInline: controlSize._4,
	},
	inlineRow: {
		display: "flex",
		alignItems: "center",
		gap: controlSize._2,
	},
	repoName: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMain,
		fontSize: font.size_2,
		fontWeight: font.weight_5,
	},
	repoDescription: {
		marginTop: controlSize._1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: color.textMuted,
		fontSize: "0.5rem",
	},
	privatePill: {
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "999px",
		color: color.textMuted,
		fontSize: "0.4375rem",
		paddingBlock: "0.125rem",
		paddingInline: "0.375rem",
	},
	externalLink: {
		display: "flex",
		width: controlSize._7,
		height: controlSize._7,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "0.375rem",
		color: {
			default: color.textMuted,
			":hover": color.textSoft,
		},
		backgroundColor: {
			default: "transparent",
			":hover": color.backgroundRaised,
		},
		transitionProperty: "background-color, color",
		transitionDuration: "120ms",
	},
	avatar: {
		display: "flex",
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "999px",
		backgroundColor: color.controlActive,
		color: color.textSoft,
		fontWeight: 600,
	},
	avatarMd: {
		width: "2.5rem",
		height: "2.5rem",
		fontSize: font.size_3,
	},
	avatarLg: {
		width: "2.5rem",
		height: "2.5rem",
		fontSize: "0.8125rem",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		objectFit: "cover",
	},
	emptyState: {
		display: "flex",
		minHeight: "180px",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: controlSize._3,
		paddingInline: controlSize._6,
		textAlign: "center",
	},
	emptyIcon: {
		display: "flex",
		width: "2.5rem",
		height: "2.5rem",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: color.border,
		borderRadius: "999px",
		backgroundColor: color.backgroundRaised,
		color: color.textMuted,
	},
	emptyTitle: {
		color: color.textMain,
		fontSize: "0.6875rem",
		fontWeight: font.weight_5,
	},
	emptyText: {
		maxWidth: "24rem",
		marginTop: controlSize._1,
		color: color.textMuted,
		fontSize: font.size_1,
		lineHeight: 1.55,
	},
});
