import React, { useState } from "react";
import { Icons } from "./Icons";

type ApiKey = {
	id: string;
	provider: string;
	name: string;
	key: string;
	isSet: boolean;
	icon: string;
};

const providers: ApiKey[] = [
	{
		id: "anthropic",
		provider: "Anthropic",
		name: "Claude API",
		key: "",
		isSet: true,
		icon: "A",
	},
	{
		id: "openai",
		provider: "OpenAI",
		name: "GPT-4 / ChatGPT",
		key: "",
		isSet: true,
		icon: "O",
	},
	{
		id: "fal",
		provider: "Fal",
		name: "Flux Image Generation",
		key: "",
		isSet: false,
		icon: "F",
	},
	{
		id: "google",
		provider: "Google",
		name: "Gemini",
		key: "",
		isSet: false,
		icon: "G",
	},
	{
		id: "replicate",
		provider: "Replicate",
		name: "Open Source Models",
		key: "",
		isSet: false,
		icon: "R",
	},
];

type ProfileTab = "profile" | "keys" | "preferences";

function ApiKeyRow({
	provider,
	onEdit,
}: {
	provider: ApiKey;
	onEdit: () => void;
}) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5 border-b border-inferay-border last:border-b-0">
			{/* Provider icon */}
			<div className="w-8 h-8 rounded-lg bg-inferay-surface border border-inferay-border flex items-center justify-center">
				<span className="text-[12px] font-bold text-inferay-text-2">
					{provider.icon}
				</span>
			</div>

			{/* Info */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-medium text-inferay-text">
						{provider.provider}
					</span>
					{provider.isSet && (
						<span className="flex items-center gap-0.5 text-[7px] text-emerald-500">
							<div className="w-1 h-1 rounded-full bg-emerald-500" />
							Connected
						</span>
					)}
				</div>
				<p className="text-[8px] text-inferay-text-3">{provider.name}</p>
			</div>

			{/* Key preview / Add button */}
			{provider.isSet ? (
				<div className="flex items-center gap-2">
					<span className="text-[9px] font-mono text-inferay-text-3">
						sk-...{Math.random().toString(36).substring(2, 6)}
					</span>
					<button
						onClick={onEdit}
						className="p-1.5 rounded-md text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2 transition-colors"
					>
						<Icons.Edit />
					</button>
				</div>
			) : (
				<button
					onClick={onEdit}
					className="h-6 px-2.5 rounded-md border border-inferay-border bg-inferay-surface text-[9px] text-inferay-text-2 hover:bg-inferay-surface-2 transition-colors"
				>
					Add Key
				</button>
			)}
		</div>
	);
}

function EditKeyModal({
	provider,
	onClose,
	onSave,
}: {
	provider: ApiKey;
	onClose: () => void;
	onSave: (key: string) => void;
}) {
	const [key, setKey] = useState("");

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Modal */}
			<div className="relative w-[320px] rounded-xl bg-inferay-bg border border-inferay-border shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between px-4 h-10 border-b border-inferay-border">
					<span className="text-[11px] font-medium text-inferay-text">
						{provider.isSet ? "Update" : "Add"} {provider.provider} API Key
					</span>
					<button
						onClick={onClose}
						className="p-1 rounded text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2 transition-colors"
					>
						<Icons.Close />
					</button>
				</div>

				{/* Content */}
				<div className="p-4 space-y-3">
					<div>
						<label className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
							API Key
						</label>
						<input
							type="password"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							placeholder={`Enter your ${provider.provider} API key`}
							className="mt-1.5 w-full h-9 rounded-md bg-inferay-surface border border-inferay-border px-3 text-[10px] font-mono text-inferay-text placeholder:text-inferay-text-3 outline-none focus:border-inferay-accent/50"
						/>
					</div>

					<p className="text-[8px] text-inferay-text-3 leading-relaxed">
						Your API key is stored locally and never sent to our servers. Get
						your key from{" "}
						<span className="text-inferay-accent underline cursor-pointer">
							{provider.provider.toLowerCase()}.com
						</span>
					</p>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-2 px-4 h-12 border-t border-inferay-border">
					{provider.isSet && (
						<button
							onClick={() => {
								onSave("");
								onClose();
							}}
							className="h-7 px-3 rounded-md border border-red-500/30 text-[9px] text-red-400 hover:bg-red-500/10 transition-colors"
						>
							Remove
						</button>
					)}
					<div className="flex-1" />
					<button
						onClick={onClose}
						className="h-7 px-3 rounded-md border border-inferay-border text-[9px] text-inferay-text-3 hover:bg-inferay-surface transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={() => {
							onSave(key);
							onClose();
						}}
						disabled={!key.trim()}
						className="h-7 px-3 rounded-md bg-inferay-accent text-[9px] font-medium text-black hover:bg-inferay-accent/90 transition-colors disabled:opacity-50"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}

export function Profile() {
	const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
	const [keys, setKeys] = useState(providers);
	const [editingProvider, setEditingProvider] = useState<ApiKey | null>(null);

	const handleSaveKey = (providerId: string, key: string) => {
		setKeys(
			keys.map((k) =>
				k.id === providerId ? { ...k, key, isSet: key.length > 0 } : k
			)
		);
	};

	const connectedCount = keys.filter((k) => k.isSet).length;

	const tabs: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
		{ id: "profile", label: "Profile", icon: <Icons.User /> },
		{ id: "keys", label: "API Keys", icon: <Icons.Zap /> },
		{ id: "preferences", label: "Preferences", icon: <Icons.Settings /> },
	];

	return (
		<div className="flex h-full w-full bg-inferay-bg">
			{/* Sidebar */}
			<div className="w-[180px] shrink-0 border-r border-inferay-border flex flex-col">
				{/* Profile header */}
				<div className="p-4 border-b border-inferay-border">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-full bg-inferay-surface-2 border border-inferay-border flex items-center justify-center">
							<Icons.User className="text-inferay-text-2" />
						</div>
						<div>
							<p className="text-[11px] font-medium text-inferay-text">User</p>
							<p className="text-[8px] text-inferay-text-3">Pro Plan</p>
						</div>
					</div>
				</div>

				{/* Nav */}
				<nav className="flex-1 py-3 px-2 space-y-0.5">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`w-full flex items-center gap-2 px-2 h-7 rounded-md text-[10px] transition-colors ${
								activeTab === tab.id
									? "bg-inferay-surface-2 text-inferay-text border border-inferay-border"
									: "text-inferay-text-3 hover:text-inferay-text-2 hover:bg-inferay-surface border border-transparent"
							}`}
						>
							<span className="text-inferay-text-3">{tab.icon}</span>
							{tab.label}
							{tab.id === "keys" && (
								<span className="ml-auto text-[8px] text-inferay-text-3 tabular-nums">
									{connectedCount}/{keys.length}
								</span>
							)}
						</button>
					))}
				</nav>

				{/* Footer */}
				<div className="p-3 border-t border-inferay-border">
					<button className="w-full flex items-center justify-center gap-1.5 h-7 rounded-md border border-inferay-border text-[9px] text-inferay-text-3 hover:bg-inferay-surface hover:text-inferay-text-2 transition-colors">
						Sign Out
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto">
				{activeTab === "profile" && (
					<div className="p-4 space-y-4">
						<div>
							<h2 className="text-[12px] font-medium text-inferay-text mb-1">
								Profile
							</h2>
							<p className="text-[9px] text-inferay-text-3">
								Manage your account information and preferences.
							</p>
						</div>

						{/* Avatar section */}
						<div className="flex items-center gap-4 p-4 rounded-lg border border-inferay-border bg-inferay-surface/30">
							<div className="w-16 h-16 rounded-full bg-inferay-surface-2 border border-inferay-border flex items-center justify-center">
								<Icons.User className="w-6 h-6 text-inferay-text-2" />
							</div>
							<div className="flex-1">
								<p className="text-[11px] font-medium text-inferay-text mb-1">
									Profile Photo
								</p>
								<div className="flex items-center gap-2">
									<button className="h-6 px-2.5 rounded-md border border-inferay-border bg-inferay-surface text-[9px] text-inferay-text-2 hover:bg-inferay-surface-2 transition-colors">
										Upload
									</button>
									<button className="h-6 px-2.5 rounded-md border border-inferay-border text-[9px] text-inferay-text-3 hover:bg-inferay-surface transition-colors">
										Remove
									</button>
								</div>
							</div>
						</div>

						{/* Form */}
						<div className="space-y-3">
							<div>
								<label className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
									Display Name
								</label>
								<input
									type="text"
									placeholder="Enter your name"
									className="mt-1.5 w-full h-8 rounded-md bg-inferay-surface border border-inferay-border px-3 text-[10px] text-inferay-text placeholder:text-inferay-text-3 outline-none focus:border-inferay-accent/50"
								/>
							</div>
							<div>
								<label className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
									Email
								</label>
								<input
									type="email"
									placeholder="user@example.com"
									className="mt-1.5 w-full h-8 rounded-md bg-inferay-surface border border-inferay-border px-3 text-[10px] text-inferay-text placeholder:text-inferay-text-3 outline-none focus:border-inferay-accent/50"
								/>
							</div>
						</div>

						{/* Plan */}
						<div className="p-3 rounded-lg bg-inferay-surface/50 border border-inferay-border">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-[10px] font-medium text-inferay-text">
										Pro Plan
									</p>
									<p className="text-[8px] text-inferay-text-3">
										Unlimited conversations, all models, priority support
									</p>
								</div>
								<button className="h-6 px-2.5 rounded-md bg-inferay-surface-2 border border-inferay-border text-[9px] font-medium text-inferay-text hover:bg-inferay-accent hover:text-black hover:border-inferay-accent transition-colors">
									Manage
								</button>
							</div>
						</div>

						{/* Save */}
						<button className="h-8 px-4 rounded-md bg-inferay-surface-2 border border-inferay-border text-[10px] font-medium text-inferay-text hover:bg-inferay-accent hover:text-black hover:border-inferay-accent transition-colors">
							Save Changes
						</button>
					</div>
				)}

				{activeTab === "keys" && (
					<div className="p-4 space-y-4">
						<div>
							<h2 className="text-[12px] font-medium text-inferay-text mb-1">
								API Keys
							</h2>
							<p className="text-[9px] text-inferay-text-3">
								Connect your own API keys to use different AI providers and
								image generation services.
							</p>
						</div>

						<div className="rounded-lg border border-inferay-border overflow-hidden">
							{keys.map((provider) => (
								<ApiKeyRow
									key={provider.id}
									provider={provider}
									onEdit={() => setEditingProvider(provider)}
								/>
							))}
						</div>

						<div className="p-3 rounded-lg bg-inferay-surface/50 border border-inferay-border">
							<div className="flex items-start gap-2">
								<Icons.Zap className="shrink-0 mt-0.5 text-inferay-accent" />
								<div>
									<p className="text-[9px] font-medium text-inferay-text mb-0.5">
										Bring Your Own Key
									</p>
									<p className="text-[8px] text-inferay-text-3 leading-relaxed">
										Your API keys are stored securely on your device. We never
										see or store your keys on our servers. You have full control
										over your AI usage and costs.
									</p>
								</div>
							</div>
						</div>
					</div>
				)}

				{activeTab === "preferences" && (
					<div className="p-4 space-y-4">
						<div>
							<h2 className="text-[12px] font-medium text-inferay-text mb-1">
								Preferences
							</h2>
							<p className="text-[9px] text-inferay-text-3">
								Configure application settings and appearance.
							</p>
						</div>

						{/* General */}
						<div className="space-y-3">
							<span className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
								General
							</span>

							<div className="flex items-center justify-between py-2 border-b border-inferay-border">
								<div>
									<span className="text-[10px] text-inferay-text">
										Default Model
									</span>
									<p className="text-[8px] text-inferay-text-3">
										Model used for new conversations
									</p>
								</div>
								<select className="h-7 px-2 rounded-md bg-inferay-surface border border-inferay-border text-[9px] text-inferay-text outline-none">
									<option>Claude Opus</option>
									<option>Claude Sonnet</option>
									<option>GPT-4</option>
								</select>
							</div>

							<div className="flex items-center justify-between py-2 border-b border-inferay-border">
								<div>
									<span className="text-[10px] text-inferay-text">
										Auto-save conversations
									</span>
									<p className="text-[8px] text-inferay-text-3">
										Automatically save chat history
									</p>
								</div>
								<button className="w-8 h-5 rounded-full bg-inferay-accent p-0.5 transition-colors">
									<div className="w-4 h-4 rounded-full bg-black translate-x-3" />
								</button>
							</div>
						</div>

						{/* Appearance */}
						<div className="space-y-3 pt-2">
							<span className="text-[8px] font-medium uppercase tracking-wide text-inferay-text-3">
								Appearance
							</span>

							<div>
								<span className="text-[9px] text-inferay-text">Theme</span>
								<div className="mt-2 flex gap-2">
									{["Dark", "Light", "System"].map((theme) => (
										<button
											key={theme}
											className={`h-8 px-4 rounded-md border text-[9px] font-medium transition-colors ${
												theme === "Dark"
													? "border-inferay-accent bg-inferay-accent/10 text-inferay-accent"
													: "border-inferay-border text-inferay-text-3 hover:border-inferay-text-3"
											}`}
										>
											{theme}
										</button>
									))}
								</div>
							</div>

							<div>
								<span className="text-[9px] text-inferay-text">Font Size</span>
								<div className="mt-2 flex gap-2">
									{["Small", "Medium", "Large"].map((size) => (
										<button
											key={size}
											className={`h-8 px-4 rounded-md border text-[9px] font-medium transition-colors ${
												size === "Medium"
													? "border-inferay-accent bg-inferay-accent/10 text-inferay-accent"
													: "border-inferay-border text-inferay-text-3 hover:border-inferay-text-3"
											}`}
										>
											{size}
										</button>
									))}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Edit Key Modal */}
			{editingProvider && (
				<EditKeyModal
					provider={editingProvider}
					onClose={() => setEditingProvider(null)}
					onSave={(key) => handleSaveKey(editingProvider.id, key)}
				/>
			)}
		</div>
	);
}

// Keep Settings as alias for backward compatibility
export const Settings = Profile;
