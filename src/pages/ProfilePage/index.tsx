import { type ReactNode, useMemo, useState } from "react";
import {
	IconCamera,
	IconLogOut,
	IconPalette,
	IconSettings,
	IconUser,
	IconZap,
} from "../../components/ui/Icons.tsx";
import {
	APP_THEMES,
	type AppThemeId,
	applyAppTheme,
	loadAppThemeId,
	saveAppThemeId,
} from "../../lib/app-theme.ts";

type ProfileTab = "profile" | "keys" | "preferences";

interface ProviderKey {
	readonly id: string;
	readonly provider: string;
	readonly label: string;
	readonly value: string;
	readonly connected: boolean;
}

const INITIAL_KEYS: readonly ProviderKey[] = [
	{
		id: "anthropic",
		provider: "Anthropic",
		label: "Claude API",
		value: "sk-ant-1x4a",
		connected: true,
	},
	{
		id: "openai",
		provider: "OpenAI",
		label: "GPT / ChatGPT",
		value: "sk-proj-6d2f",
		connected: true,
	},
	{
		id: "google",
		provider: "Google",
		label: "Gemini",
		value: "",
		connected: false,
	},
	{
		id: "replicate",
		provider: "Replicate",
		label: "Open Source Models",
		value: "",
		connected: false,
	},
	{
		id: "fal",
		provider: "Fal",
		label: "Image Generation",
		value: "",
		connected: false,
	},
] as const;

function ThemeCard({
	active,
	id,
	name,
	onClick,
}: {
	active: boolean;
	id: AppThemeId;
	name: string;
	onClick: (id: AppThemeId) => void;
}) {
	const theme = APP_THEMES.find((item) => item.id === id);
	if (!theme) return null;

	return (
		<button
			type="button"
			onClick={() => onClick(id)}
			className={`flex min-w-0 flex-col gap-2 rounded-xl border p-2 text-left transition-colors ${
				active
					? "border-inferay-accent bg-inferay-accent/10"
					: "border-inferay-border bg-inferay-surface/40 hover:bg-inferay-surface"
			}`}
		>
			<div className="flex h-10 overflow-hidden rounded-lg border border-inferay-border/40">
				<div
					className="flex w-1/2 items-center justify-center"
					style={{ backgroundColor: theme.colors.bg }}
				>
					<div
						className="h-1.5 w-1.5 rounded-full"
						style={{ backgroundColor: theme.colors.accent }}
					/>
				</div>
				<div
					className="flex w-1/2 items-center justify-center"
					style={{ backgroundColor: theme.colors.surface2 }}
				>
					<div
						className="h-1 w-8 rounded"
						style={{ backgroundColor: theme.colors.text }}
					/>
				</div>
			</div>
			<div className="min-w-0">
				<p
					className={`truncate text-[10px] font-medium ${
						active ? "text-inferay-text" : "text-inferay-text-2"
					}`}
				>
					{name}
				</p>
				<p className="text-[8px] text-inferay-text-3">
					{theme.light ? "Light theme" : "Dark theme"}
				</p>
			</div>
		</button>
	);
}

export function ProfilePage() {
	const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
	const [displayName, setDisplayName] = useState("User");
	const [email, setEmail] = useState("user@example.com");
	const [selectedTheme, setSelectedTheme] =
		useState<AppThemeId>(loadAppThemeId);
	const [keys] = useState<readonly ProviderKey[]>(INITIAL_KEYS);
	const [defaultModel, setDefaultModel] = useState("Claude Opus");
	const [autoSave, setAutoSave] = useState(true);
	const [fontSize, setFontSize] = useState<"Small" | "Medium" | "Large">(
		"Medium"
	);

	const connectedCount = useMemo(
		() => keys.filter((provider) => provider.connected).length,
		[keys]
	);

	const handleThemeSelect = (id: AppThemeId) => {
		setSelectedTheme(id);
		saveAppThemeId(id);
		applyAppTheme(id);
	};

	const tabs: {
		readonly id: ProfileTab;
		readonly label: string;
		readonly icon: ReactNode;
	}[] = [
		{ id: "profile", label: "Profile", icon: <IconUser size={13} /> },
		{ id: "keys", label: "API Keys", icon: <IconZap size={13} /> },
		{
			id: "preferences",
			label: "Preferences",
			icon: <IconSettings size={13} />,
		},
	];

	return (
		<div className="flex h-full min-h-0 bg-inferay-bg">
			<aside className="flex w-[220px] shrink-0 flex-col border-r border-inferay-border bg-inferay-bg">
				<div className="border-b border-inferay-border px-4 py-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full border border-inferay-border bg-inferay-surface-2">
							<IconUser size={18} className="text-inferay-text-2" />
						</div>
						<div>
							<p className="text-[11px] font-medium text-inferay-text">
								{displayName}
							</p>
							<p className="text-[8px] text-inferay-text-3">Pro Plan</p>
						</div>
					</div>
				</div>

				<nav className="flex-1 space-y-1 px-3 py-3">
					{tabs.map((tab) => {
						const active = activeTab === tab.id;
						return (
							<button
								type="button"
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={`flex h-8 w-full items-center gap-2 rounded-lg border px-2.5 text-[10px] transition-colors ${
									active
										? "border-inferay-border bg-inferay-surface-2 text-inferay-text"
										: "border-transparent text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2"
								}`}
							>
								<span className="text-inferay-text-3">{tab.icon}</span>
								<span>{tab.label}</span>
								{tab.id === "keys" ? (
									<span className="ml-auto text-[8px] tabular-nums text-inferay-text-3">
										{connectedCount}/{keys.length}
									</span>
								) : null}
							</button>
						);
					})}
				</nav>

				<div className="border-t border-inferay-border p-3">
					<button
						type="button"
						className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-inferay-border text-[10px] text-inferay-text-3 transition-colors hover:bg-inferay-surface hover:text-inferay-text-2"
					>
						<IconLogOut size={13} />
						<span>Sign Out</span>
					</button>
				</div>
			</aside>

			<div className="min-w-0 flex-1 overflow-y-auto">
				{activeTab === "profile" ? (
					<div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-5">
						<div>
							<h1 className="text-[13px] font-medium text-inferay-text">
								Profile
							</h1>
							<p className="mt-1 text-[9px] text-inferay-text-3">
								Manage your account information and preferences.
							</p>
						</div>

						<div className="flex items-center gap-4 rounded-xl border border-inferay-border bg-inferay-surface/30 p-4">
							<div className="flex h-16 w-16 items-center justify-center rounded-full border border-inferay-border bg-inferay-surface-2">
								<IconUser size={24} className="text-inferay-text-2" />
							</div>
							<div className="flex-1">
								<p className="text-[11px] font-medium text-inferay-text">
									Profile Photo
								</p>
								<div className="mt-2 flex items-center gap-2">
									<button
										type="button"
										className="flex h-7 items-center gap-1.5 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 text-[9px] text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
									>
										<IconCamera size={12} />
										<span>Upload</span>
									</button>
									<button
										type="button"
										className="h-7 rounded-lg border border-inferay-border px-2.5 text-[9px] text-inferay-text-3 transition-colors hover:bg-inferay-surface hover:text-inferay-text-2"
									>
										Remove
									</button>
								</div>
							</div>
						</div>

						<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
							<div className="space-y-3 rounded-xl border border-inferay-border bg-inferay-surface/20 p-4">
								<div>
									<label
										htmlFor="profile-display-name"
										className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3"
									>
										Display Name
									</label>
									<input
										id="profile-display-name"
										type="text"
										value={displayName}
										onChange={(event) => setDisplayName(event.target.value)}
										className="mt-1.5 h-9 w-full rounded-lg border border-inferay-border bg-inferay-surface px-3 text-[10px] text-inferay-text outline-none focus:border-inferay-accent/50"
									/>
								</div>
								<div>
									<label
										htmlFor="profile-email"
										className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3"
									>
										Email
									</label>
									<input
										id="profile-email"
										type="email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										className="mt-1.5 h-9 w-full rounded-lg border border-inferay-border bg-inferay-surface px-3 text-[10px] text-inferay-text outline-none focus:border-inferay-accent/50"
									/>
								</div>
								<button
									type="button"
									className="h-8 rounded-lg border border-inferay-border bg-inferay-surface-2 px-4 text-[10px] font-medium text-inferay-text transition-colors hover:border-inferay-accent hover:bg-inferay-accent hover:text-black"
								>
									Save Changes
								</button>
							</div>

							<div className="rounded-xl border border-inferay-border bg-inferay-surface/30 p-4">
								<p className="text-[10px] font-medium text-inferay-text">
									Pro Plan
								</p>
								<p className="mt-1 text-[8px] leading-relaxed text-inferay-text-3">
									Unlimited conversations, all models, priority support.
								</p>
								<button
									type="button"
									className="mt-4 h-8 rounded-lg border border-inferay-border bg-inferay-surface-2 px-3 text-[9px] font-medium text-inferay-text transition-colors hover:border-inferay-accent hover:bg-inferay-accent hover:text-black"
								>
									Manage
								</button>
							</div>
						</div>
					</div>
				) : null}

				{activeTab === "keys" ? (
					<div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-5">
						<div>
							<h1 className="text-[13px] font-medium text-inferay-text">
								API Keys
							</h1>
							<p className="mt-1 text-[9px] text-inferay-text-3">
								Mock provider keys for now. The layout matches the landing page
								and can be wired to real storage later.
							</p>
						</div>

						<div className="overflow-hidden rounded-xl border border-inferay-border bg-inferay-surface/20">
							{keys.map((provider) => (
								<div
									key={provider.id}
									className="flex items-center gap-3 border-b border-inferay-border px-4 py-3 last:border-b-0"
								>
									<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-inferay-border bg-inferay-surface text-[10px] font-semibold text-inferay-text-2">
										{provider.provider.slice(0, 1)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="text-[10px] font-medium text-inferay-text">
												{provider.provider}
											</p>
											{provider.connected ? (
												<span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[7px] font-medium text-emerald-400">
													Connected
												</span>
											) : null}
										</div>
										<p className="text-[8px] text-inferay-text-3">
											{provider.label}
										</p>
									</div>
									{provider.connected ? (
										<span className="font-mono text-[9px] text-inferay-text-3">
											{provider.value}
										</span>
									) : (
										<button
											type="button"
											className="h-7 rounded-lg border border-inferay-border bg-inferay-surface px-2.5 text-[9px] text-inferay-text-2 transition-colors hover:bg-inferay-surface-2"
										>
											Add Key
										</button>
									)}
								</div>
							))}
						</div>
					</div>
				) : null}

				{activeTab === "preferences" ? (
					<div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-5">
						<div>
							<h1 className="text-[13px] font-medium text-inferay-text">
								Preferences
							</h1>
							<p className="mt-1 text-[9px] text-inferay-text-3">
								Application settings and appearance.
							</p>
						</div>

						<section className="rounded-xl border border-inferay-border bg-inferay-surface/20 p-4">
							<p className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
								General
							</p>
							<div className="mt-3 space-y-3">
								<div className="flex items-center justify-between gap-4 border-b border-inferay-border pb-3">
									<div>
										<p className="text-[10px] text-inferay-text">
											Default Model
										</p>
										<p className="text-[8px] text-inferay-text-3">
											Model used for new conversations
										</p>
									</div>
									<select
										value={defaultModel}
										onChange={(event) => setDefaultModel(event.target.value)}
										className="h-8 rounded-lg border border-inferay-border bg-inferay-surface px-3 text-[9px] text-inferay-text outline-none"
									>
										<option>Claude Opus</option>
										<option>Claude Sonnet</option>
										<option>GPT-4.1</option>
									</select>
								</div>

								<div className="flex items-center justify-between gap-4">
									<div>
										<p className="text-[10px] text-inferay-text">
											Auto-save conversations
										</p>
										<p className="text-[8px] text-inferay-text-3">
											Automatically save chat history
										</p>
									</div>
									<button
										type="button"
										onClick={() => setAutoSave((current) => !current)}
										className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors ${
											autoSave ? "bg-inferay-accent" : "bg-inferay-surface-3"
										}`}
									>
										<div
											className={`h-5 w-5 rounded-full bg-black transition-transform ${
												autoSave ? "translate-x-4" : "translate-x-0"
											}`}
										/>
									</button>
								</div>
							</div>
						</section>

						<section className="rounded-xl border border-inferay-border bg-inferay-surface/20 p-4">
							<div className="flex items-center gap-2">
								<IconPalette size={13} className="text-inferay-text-2" />
								<p className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
									Theme
								</p>
							</div>
							<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
								{APP_THEMES.map((theme) => (
									<ThemeCard
										key={theme.id}
										active={selectedTheme === theme.id}
										id={theme.id}
										name={theme.name}
										onClick={handleThemeSelect}
									/>
								))}
							</div>
						</section>

						<section className="rounded-xl border border-inferay-border bg-inferay-surface/20 p-4">
							<p className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
								Font Size
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								{(["Small", "Medium", "Large"] as const).map((size) => (
									<button
										type="button"
										key={size}
										onClick={() => setFontSize(size)}
										className={`h-8 rounded-lg border px-3 text-[9px] font-medium transition-colors ${
											fontSize === size
												? "border-inferay-accent bg-inferay-accent/10 text-inferay-accent"
												: "border-inferay-border bg-inferay-surface text-inferay-text-3 hover:bg-inferay-surface-2 hover:text-inferay-text-2"
										}`}
									>
										{size}
									</button>
								))}
							</div>
						</section>
					</div>
				) : null}
			</div>
		</div>
	);
}
