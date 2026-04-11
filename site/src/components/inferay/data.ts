// Diff background colors
export const colors = {
	added: "rgba(46, 160, 67, 0.15)",
	removed: "rgba(248, 81, 73, 0.15)",
};

// Mock diff data - API client refactoring example
export const diffRows = [
	// Imports section
	{
		left: {
			num: 1,
			content: 'import { useState, useEffect, useCallback } from "react";',
			type: "normal",
		},
		right: {
			num: 1,
			content: 'import { useState, useEffect, useCallback } from "react";',
			type: "normal",
		},
	},
	{
		left: {
			num: 2,
			content: 'import { ApiClient } from "../lib/api";',
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 2,
			content: 'import { createApiClient, type ApiConfig } from "../lib/api";',
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 3,
			content: 'import { useAuth } from "../hooks/useAuth";',
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 4,
			content: 'import { RetryStrategy } from "../lib/retry";',
			type: "added",
		},
	},
	{
		left: {
			num: 3,
			content: 'import { LoadingSpinner } from "./LoadingSpinner";',
			type: "normal",
		},
		right: {
			num: 5,
			content: 'import { LoadingSpinner } from "./LoadingSpinner";',
			type: "normal",
		},
	},
	{
		left: {
			num: 4,
			content: 'import { ErrorBoundary } from "./ErrorBoundary";',
			type: "normal",
		},
		right: {
			num: 6,
			content: 'import { ErrorBoundary } from "./ErrorBoundary";',
			type: "normal",
		},
	},
	{
		left: { num: 5, content: "", type: "normal" },
		right: { num: 7, content: "", type: "normal" },
	},
	// Types section
	{
		left: { num: 6, content: "interface UserData {", type: "normal" },
		right: { num: 8, content: "interface UserData {", type: "normal" },
	},
	{
		left: { num: 7, content: "  id: string;", type: "normal" },
		right: { num: 9, content: "  id: string;", type: "normal" },
	},
	{
		left: { num: 8, content: "  name: string;", type: "normal" },
		right: { num: 10, content: "  name: string;", type: "normal" },
	},
	{
		left: { num: 9, content: "  email: string;", type: "normal" },
		right: { num: 11, content: "  email: string;", type: "normal" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 12,
			content: "  role: 'admin' | 'user' | 'guest';",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 13, content: "  lastActive: Date;", type: "added" },
	},
	{
		left: { num: 10, content: "}", type: "normal" },
		right: { num: 14, content: "}", type: "normal" },
	},
	{
		left: { num: 11, content: "", type: "normal" },
		right: { num: 15, content: "", type: "normal" },
	},
	// Config section (new)
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 16,
			content: "const apiConfig: ApiConfig = {",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 17,
			content: '  baseUrl: process.env.API_URL ?? "https://api.example.com",',
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 18, content: "  timeout: 30000,", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 19,
			content:
				"  retry: new RetryStrategy({ maxAttempts: 3, backoff: 'exponential' }),",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 20, content: "};", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 21, content: "", type: "added" },
	},
	// Component
	{
		left: {
			num: 12,
			content: "export function UserProfile({ userId }: { userId: string }) {",
			type: "normal",
		},
		right: {
			num: 22,
			content: "export function UserProfile({ userId }: { userId: string }) {",
			type: "normal",
		},
	},
	{
		left: {
			num: 13,
			content: "  const [user, setUser] = useState<UserData | null>(null);",
			type: "normal",
		},
		right: {
			num: 23,
			content: "  const [user, setUser] = useState<UserData | null>(null);",
			type: "normal",
		},
	},
	{
		left: {
			num: 14,
			content: "  const [loading, setLoading] = useState(true);",
			type: "normal",
		},
		right: {
			num: 24,
			content: "  const [loading, setLoading] = useState(true);",
			type: "normal",
		},
	},
	{
		left: {
			num: 15,
			content: "  const [error, setError] = useState<Error | null>(null);",
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 25,
			content: "  const [error, setError] = useState<string | null>(null);",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 26,
			content: "  const { token, refreshToken } = useAuth();",
			type: "added",
		},
	},
	{
		left: { num: 16, content: "", type: "normal" },
		right: { num: 27, content: "", type: "normal" },
	},
	// API client initialization
	{
		left: {
			num: 17,
			content: "  const api = new ApiClient();",
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 28,
			content: "  const api = useCallback(() => {",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 29, content: "    return createApiClient({", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 30, content: "      ...apiConfig,", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 31,
			content: "      headers: { Authorization: `Bearer ${token}` },",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 32,
			content: "      onUnauthorized: refreshToken,",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 33, content: "    });", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 34, content: "  }, [token, refreshToken]);", type: "added" },
	},
	{
		left: { num: 18, content: "", type: "normal" },
		right: { num: 35, content: "", type: "normal" },
	},
	// useEffect
	{
		left: { num: 19, content: "  useEffect(() => {", type: "normal" },
		right: { num: 36, content: "  useEffect(() => {", type: "normal" },
	},
	{
		left: {
			num: 20,
			content: "    async function fetchUser() {",
			type: "normal",
		},
		right: {
			num: 37,
			content: "    const controller = new AbortController();",
			type: "normal",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 38, content: "", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 39,
			content: "    async function fetchUser() {",
			type: "added",
		},
	},
	{
		left: { num: 21, content: "      try {", type: "normal" },
		right: { num: 40, content: "      try {", type: "normal" },
	},
	{
		left: {
			num: 22,
			content: "        const data = await api.get(`/users/${userId}`);",
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 41,
			content: "        const response = await api().get(`/users/${userId}`, {",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 42,
			content: "          signal: controller.signal,",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 43, content: "        });", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 44,
			content: "        const data = await response.json();",
			type: "added",
		},
	},
	{
		left: { num: 23, content: "        setUser(data);", type: "normal" },
		right: { num: 45, content: "        setUser(data);", type: "normal" },
	},
	{
		left: { num: 24, content: "      } catch (err) {", type: "normal" },
		right: { num: 46, content: "      } catch (err) {", type: "normal" },
	},
	{
		left: {
			num: 25,
			content: "        setError(err as Error);",
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 47,
			content:
				"        if (err instanceof Error && err.name !== 'AbortError') {",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 48,
			content: "          setError(err.message);",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 49,
			content: "          console.error('Failed to fetch user:', err);",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 50, content: "        }", type: "added" },
	},
	{
		left: { num: 26, content: "      } finally {", type: "normal" },
		right: { num: 51, content: "      } finally {", type: "normal" },
	},
	{
		left: { num: 27, content: "        setLoading(false);", type: "normal" },
		right: { num: 52, content: "        setLoading(false);", type: "normal" },
	},
	{
		left: { num: 28, content: "      }", type: "normal" },
		right: { num: 53, content: "      }", type: "normal" },
	},
	{
		left: { num: 29, content: "    }", type: "normal" },
		right: { num: 54, content: "    }", type: "normal" },
	},
	{
		left: { num: 30, content: "", type: "normal" },
		right: { num: 55, content: "", type: "normal" },
	},
	{
		left: { num: 31, content: "    fetchUser();", type: "normal" },
		right: { num: 56, content: "    fetchUser();", type: "normal" },
	},
	{
		left: { num: 32, content: "  }, [userId]);", type: "removed" },
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 57, content: "", type: "added" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 58,
			content: "    return () => controller.abort();",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 59, content: "  }, [userId, api]);", type: "added" },
	},
	{
		left: { num: 33, content: "", type: "normal" },
		right: { num: 60, content: "", type: "normal" },
	},
	// Render
	{
		left: {
			num: 34,
			content: "  if (loading) return <LoadingSpinner />;",
			type: "normal",
		},
		right: {
			num: 61,
			content: "  if (loading) return <LoadingSpinner />;",
			type: "normal",
		},
	},
	{
		left: {
			num: 35,
			content: "  if (error) return <div>Error: {error.message}</div>;",
			type: "removed",
		},
		right: { num: null, content: "", type: "empty" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 62,
			content:
				"  if (error) return <ErrorBoundary message={error} onRetry={() => setError(null)} />;",
			type: "added",
		},
	},
	{
		left: { num: 36, content: "  if (!user) return null;", type: "normal" },
		right: { num: 63, content: "  if (!user) return null;", type: "normal" },
	},
	{
		left: { num: 37, content: "", type: "normal" },
		right: { num: 64, content: "", type: "normal" },
	},
	{
		left: { num: 38, content: "  return (", type: "normal" },
		right: { num: 65, content: "  return (", type: "normal" },
	},
	{
		left: {
			num: 39,
			content: '    <div className="user-profile">',
			type: "normal",
		},
		right: {
			num: 66,
			content: '    <div className="user-profile">',
			type: "normal",
		},
	},
	{
		left: { num: 40, content: "      <h1>{user.name}</h1>", type: "normal" },
		right: { num: 67, content: "      <h1>{user.name}</h1>", type: "normal" },
	},
	{
		left: { num: 41, content: "      <p>{user.email}</p>", type: "normal" },
		right: { num: 68, content: "      <p>{user.email}</p>", type: "normal" },
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 69,
			content:
				"      <span className={`badge badge-${user.role}`}>{user.role}</span>",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 70,
			content: "      <time dateTime={user.lastActive.toISOString()}>",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: {
			num: 71,
			content: "        Last active: {user.lastActive.toLocaleDateString()}",
			type: "added",
		},
	},
	{
		left: { num: null, content: "", type: "empty" },
		right: { num: 72, content: "      </time>", type: "added" },
	},
	{
		left: { num: 42, content: "    </div>", type: "normal" },
		right: { num: 73, content: "    </div>", type: "normal" },
	},
	{
		left: { num: 43, content: "  );", type: "normal" },
		right: { num: 74, content: "  );", type: "normal" },
	},
	{
		left: { num: 44, content: "}", type: "normal" },
		right: { num: 75, content: "}", type: "normal" },
	},
];

// Activity timeline data
export const activityTimeline = [
	{ time: "0:52", type: "edit", file: "UserProfile.tsx" },
	{ time: "0:47", type: "read", file: "api.ts" },
	{ time: "0:41", type: "bash", command: "npm run typecheck" },
	{ time: "0:35", type: "edit", file: "useAuth.ts" },
	{ time: "0:28", type: "read", file: "RetryStrategy.ts" },
	{ time: "0:21", type: "search", query: "AbortController" },
	{ time: "0:14", type: "edit", file: "types.ts" },
	{ time: "0:08", type: "bash", command: "npm run test" },
];

// Session timeline (full history)
export const sessionTimeline = [
	{
		time: "2m ago",
		type: "conversation",
		summary: "Added dark mode toggle to settings",
		status: "complete",
		changes: 3,
	},
	{
		time: "8m ago",
		type: "conversation",
		summary: "Fixed theme persistence bug",
		status: "complete",
		changes: 2,
	},
	{
		time: "15m ago",
		type: "conversation",
		summary: "Refactored ThemeContext provider",
		status: "complete",
		changes: 5,
	},
	{
		time: "22m ago",
		type: "conversation",
		summary: "Created useSettings hook",
		status: "complete",
		changes: 1,
	},
	{
		time: "30m ago",
		type: "checkpoint",
		summary: "Session started",
		status: "checkpoint",
	},
];

// Graph nodes (file dependencies) - centered layout for ~900x600 canvas
export const graphNodes = [
	// Top level - Entry points
	{
		id: "app",
		label: "App.tsx",
		x: 400,
		y: 40,
		type: "entry",
		connections: ["router", "providers", "layout"],
	},
	{
		id: "main",
		label: "main.tsx",
		x: 250,
		y: 40,
		type: "entry",
		connections: ["app"],
	},

	// Second level - Core architecture
	{
		id: "router",
		label: "Router.tsx",
		x: 550,
		y: 120,
		type: "normal",
		connections: ["dashboard", "settings", "profile"],
	},
	{
		id: "providers",
		label: "Providers.tsx",
		x: 400,
		y: 120,
		type: "normal",
		connections: ["theme", "auth", "query"],
	},
	{
		id: "layout",
		label: "Layout.tsx",
		x: 250,
		y: 120,
		type: "modified",
		connections: ["sidebar", "header", "theme"],
	},

	// Third level - Features & Contexts
	{
		id: "dashboard",
		label: "Dashboard.tsx",
		x: 680,
		y: 200,
		type: "normal",
		connections: ["useMetrics", "chart"],
	},
	{
		id: "settings",
		label: "SettingsPanel.tsx",
		x: 550,
		y: 200,
		type: "modified",
		connections: ["toggle", "useSettings"],
	},
	{
		id: "profile",
		label: "ProfilePage.tsx",
		x: 420,
		y: 200,
		type: "normal",
		connections: ["useAuth", "avatar"],
	},
	{
		id: "theme",
		label: "ThemeContext.tsx",
		x: 280,
		y: 200,
		type: "modified",
		connections: ["useSettings"],
	},
	{
		id: "auth",
		label: "AuthContext.tsx",
		x: 150,
		y: 200,
		type: "normal",
		connections: ["useAuth", "api"],
	},
	{
		id: "query",
		label: "QueryProvider.tsx",
		x: 80,
		y: 140,
		type: "normal",
		connections: ["api"],
	},

	// Fourth level - UI Components
	{
		id: "sidebar",
		label: "Sidebar.tsx",
		x: 150,
		y: 290,
		type: "normal",
		connections: ["navItem"],
	},
	{
		id: "header",
		label: "Header.tsx",
		x: 280,
		y: 290,
		type: "normal",
		connections: ["avatar", "dropdown"],
	},
	{
		id: "toggle",
		label: "DarkModeToggle.tsx",
		x: 550,
		y: 290,
		type: "added",
		connections: ["theme"],
	},
	{
		id: "chart",
		label: "MetricsChart.tsx",
		x: 680,
		y: 290,
		type: "added",
		connections: [],
	},
	{
		id: "avatar",
		label: "Avatar.tsx",
		x: 420,
		y: 290,
		type: "normal",
		connections: [],
	},

	// Fifth level - Hooks & Utils
	{
		id: "useSettings",
		label: "useSettings.ts",
		x: 480,
		y: 380,
		type: "normal",
		connections: ["storage"],
	},
	{
		id: "useMetrics",
		label: "useMetrics.ts",
		x: 620,
		y: 380,
		type: "added",
		connections: ["api"],
	},
	{
		id: "useAuth",
		label: "useAuth.ts",
		x: 200,
		y: 380,
		type: "normal",
		connections: ["api", "storage"],
	},
	{
		id: "navItem",
		label: "NavItem.tsx",
		x: 80,
		y: 380,
		type: "normal",
		connections: [],
	},
	{
		id: "dropdown",
		label: "Dropdown.tsx",
		x: 340,
		y: 380,
		type: "normal",
		connections: [],
	},

	// Bottom level - Core utilities
	{
		id: "api",
		label: "api.ts",
		x: 400,
		y: 470,
		type: "modified",
		connections: ["types"],
	},
	{
		id: "storage",
		label: "storage.ts",
		x: 550,
		y: 470,
		type: "normal",
		connections: [],
	},
	{
		id: "types",
		label: "types.ts",
		x: 280,
		y: 470,
		type: "modified",
		connections: [],
	},
	{
		id: "utils",
		label: "utils.ts",
		x: 680,
		y: 470,
		type: "normal",
		connections: [],
	},
];

// Context items (files loaded into conversation)
export const contextItems = [
	{ type: "file", name: "SettingsPanel.tsx", tokens: 847 },
	{ type: "file", name: "ThemeContext.tsx", tokens: 523 },
	{ type: "git", name: "Unstaged changes", tokens: 156 },
	{ type: "docs", name: "React hooks guide", tokens: 2100 },
];

// Models available
export const models = [
	{ id: "opus-4.7", name: "Opus 4.7", provider: "anthropic", color: "#D97706" },
	{ id: "gpt-5.4", name: "GPT 5.4", provider: "openai", color: "#10B981" },
];

// Inline diff data - shows focused change in chat bubble
export const inlineDiffLines = [
	{ num: 28, content: "  const api = useCallback(() => {", type: "added" },
	{ num: 29, content: "    return createApiClient({", type: "added" },
	{ num: 30, content: "      ...apiConfig,", type: "added" },
	{
		num: 31,
		content: "      headers: { Authorization: `Bearer ${token}` },",
		type: "added",
	},
	{ num: 32, content: "      onUnauthorized: refreshToken,", type: "added" },
	{ num: 33, content: "    });", type: "added" },
	{ num: 34, content: "  }, [token, refreshToken]);", type: "added" },
];

// Different inline diffs for each chat thread
export const inlineDiffVariants = {
	authMiddleware: [
		{
			num: 15,
			content: "  const validateState = (state: string) => {",
			type: "added",
		},
		{
			num: 16,
			content: "    const decoded = Buffer.from(state, 'base64');",
			type: "added",
		},
		{
			num: 17,
			content: "    const { nonce, returnTo } = JSON.parse(decoded);",
			type: "added",
		},
		{
			num: 18,
			content: "    if (!verifyNonce(nonce)) throw new AuthError();",
			type: "added",
		},
		{ num: 19, content: "    return returnTo;", type: "added" },
		{ num: 20, content: "  };", type: "added" },
	],
	useAuthHook: [
		{ num: 42, content: "  const refresh = async () => {", type: "added" },
		{
			num: 43,
			content: "    const res = await fetch('/api/refresh', {",
			type: "added",
		},
		{ num: 44, content: "      method: 'POST',", type: "added" },
		{ num: 45, content: "      credentials: 'include',", type: "added" },
		{ num: 46, content: "    });", type: "added" },
		{
			num: 47,
			content: "    const { token } = await res.json();",
			type: "added",
		},
		{ num: 48, content: "    setAccessToken(token);", type: "added" },
		{ num: 49, content: "  };", type: "added" },
	],
	cacheWrapper: [
		{
			num: 8,
			content: "  async getUser(id: string): Promise<User> {",
			type: "added",
		},
		{
			num: 9,
			content: "    const cached = await redis.get(`user:${id}`);",
			type: "added",
		},
		{
			num: 10,
			content: "    if (cached) return JSON.parse(cached);",
			type: "added",
		},
		{
			num: 11,
			content: "    const user = await this.db.findUser(id);",
			type: "added",
		},
		{
			num: 12,
			content:
				"    await redis.setex(`user:${id}`, 3600, JSON.stringify(user));",
			type: "added",
		},
		{ num: 13, content: "    return user;", type: "added" },
		{ num: 14, content: "  }", type: "added" },
	],
	cacheTypes: [
		{ num: 3, content: "export interface CacheOptions {", type: "added" },
		{ num: 4, content: "  ttl?: number;", type: "added" },
		{ num: 5, content: "  prefix?: string;", type: "added" },
		{ num: 6, content: "  serialize?: (v: unknown) => string;", type: "added" },
		{ num: 7, content: "}", type: "added" },
	],
	migration: [
		{ num: 1, content: "ALTER TABLE users", type: "added" },
		{
			num: 2,
			content: "  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,",
			type: "added",
		},
		{
			num: 3,
			content: "  ADD COLUMN last_login TIMESTAMP NULL;",
			type: "added",
		},
		{ num: 4, content: "", type: "added" },
		{
			num: 5,
			content: "CREATE INDEX idx_users_last_login ON users(last_login);",
			type: "added",
		},
	],
	userType: [
		{ num: 12, content: "export interface User {", type: "normal" },
		{ num: 13, content: "  id: string;", type: "normal" },
		{ num: 14, content: "  email: string;", type: "normal" },
		{ num: 15, content: "  name: string;", type: "added" },
		{ num: 16, content: "  emailVerified: boolean;", type: "added" },
		{ num: 17, content: "  lastLogin: Date | null;", type: "added" },
		{ num: 18, content: "}", type: "normal" },
	],
};

// Chat data
export const chatMessages = [
	{
		role: "user",
		content:
			"refactor the API client to support auth tokens and request cancellation",
	},
	{
		role: "assistant",
		content:
			"I'll refactor the API client with proper auth handling. Let me read the current implementation.",
		tool: { name: "Read", file: "UserProfile.tsx" },
	},
	{
		role: "assistant",
		content:
			"Adding auth token support and abort controller for request cancellation:",
		tool: { name: "Edit", file: "UserProfile.tsx" },
		inlineDiff: true,
	},
	{
		role: "assistant",
		content:
			"Done. The API client now uses auth tokens with automatic refresh, and requests can be cancelled on unmount.",
	},
];

// Multiple chat threads for grid view - each with different states and activities
export const chatThreads = [
	{
		id: 1,
		title: "API refactoring",
		time: "0:42",
		status: "editing",
		statusFile: "UserProfile.tsx",
		directory: "~/projects/my-app",
		branch: "main",
		messages: [
			{
				role: "user",
				content:
					"refactor the API client to support auth tokens and add request cancellation on component unmount",
			},
			{
				role: "assistant",
				content:
					"I'll refactor the API client. Let me first check the current implementation to understand how requests are being made.",
				tool: { name: "Read", file: "api.ts" },
			},
			{
				role: "assistant",
				content:
					"I see the current setup. The API client is instantiated directly without any auth handling. I'll add token support with automatic refresh and AbortController for cancellation.",
			},
			{
				role: "user",
				content: "yes please, and make sure it handles 401 errors gracefully",
			},
			{
				role: "assistant",
				content: "Adding the auth wrapper with error handling:",
				tool: { name: "Edit", file: "UserProfile.tsx" },
				inlineDiff: true,
				diffVariant: "default",
			},
			{
				role: "assistant",
				content:
					"Now I need to update the useAuth hook to expose the refresh function:",
				tool: { name: "Edit", file: "useAuth.ts" },
				inlineDiff: true,
				diffVariant: "useAuthHook",
			},
		],
	},
	{
		id: 2,
		title: "Fix OAuth flow",
		time: "1:18",
		status: "reading",
		statusFile: "callback.ts",
		directory: "~/projects/api-server",
		branch: "fix/oauth",
		messages: [
			{
				role: "user",
				content:
					"the login redirect is broken after oauth callback - users are getting stuck on a blank page",
			},
			{
				role: "assistant",
				content:
					"Let me investigate the OAuth callback flow. I'll start by checking the middleware that handles the callback.",
				tool: { name: "Read", file: "authMiddleware.ts" },
			},
			{
				role: "assistant",
				content:
					"I found the issue - the state parameter from the OAuth provider isn't being validated before the redirect. This is a security issue and could also cause the blank page if the state is malformed.",
			},
			{ role: "user", content: "can you fix it? we need this deployed today" },
			{
				role: "assistant",
				content: "On it. First, fixing the state validation:",
				tool: { name: "Edit", file: "authMiddleware.ts" },
				inlineDiff: true,
				diffVariant: "authMiddleware",
			},
			{
				role: "assistant",
				content:
					"Now let me check the callback handler to ensure the redirect URL is being constructed correctly...",
				tool: { name: "Read", file: "callback.ts" },
			},
		],
	},
	{
		id: 3,
		title: "Add caching layer",
		time: "0:08",
		status: "running",
		statusFile: "npm test",
		directory: "~/projects/backend",
		branch: "feature/cache",
		messages: [
			{ role: "user", content: "add redis caching to the user service" },
			{
				role: "assistant",
				content:
					"I found your existing cache utility. I'll extend it for the user service.",
				tool: { name: "Read", file: "cache.ts" },
			},
			{
				role: "assistant",
				content: "Added cache wrapper with TTL support:",
				tool: { name: "Edit", file: "userService.ts" },
				inlineDiff: true,
				diffVariant: "cacheWrapper",
			},
			{
				role: "assistant",
				content: "Also updated the types:",
				tool: { name: "Edit", file: "types.ts" },
				inlineDiff: true,
				diffVariant: "cacheTypes",
			},
			{
				role: "assistant",
				content: "Running tests to verify the changes...",
				tool: { name: "Bash", command: "npm test" },
			},
		],
	},
	{
		id: 4,
		title: "Database migration",
		time: "2:34",
		status: "complete",
		directory: "~/projects/saas-app",
		branch: "feature/users-v2",
		messages: [
			{
				role: "user",
				content:
					"create a migration to add email_verified and last_login columns to the users table",
			},
			{
				role: "assistant",
				content:
					"I'll create a new migration for those columns. Let me first check your existing migrations to follow the same patterns.",
				tool: { name: "Read", file: "migrations/001_create_users.sql" },
			},
			{
				role: "assistant",
				content: "Creating the migration with proper defaults and indexes:",
				tool: { name: "Edit", file: "migrations/002_add_user_fields.sql" },
				inlineDiff: true,
				diffVariant: "migration",
			},
			{
				role: "user",
				content: "looks good, can you also update the User type?",
			},
			{
				role: "assistant",
				content: "Updated the User interface:",
				tool: { name: "Edit", file: "types/user.ts" },
				inlineDiff: true,
				diffVariant: "userType",
			},
			{
				role: "assistant",
				content:
					"Done! The migration adds email_verified (boolean, default false) and last_login (timestamp, nullable) columns with an index on last_login for query performance.",
			},
		],
	},
];

// File tree with git staging status
export type FileStatus = "M" | "A" | "D" | "?";
export type GitFile = {
	name: string;
	path: string;
	status: FileStatus;
	staged: boolean;
};

export const stagedFiles: GitFile[] = [
	{
		name: "UserProfile.tsx",
		path: "src/components/UserProfile.tsx",
		status: "M",
		staged: true,
	},
	{
		name: "useAuth.ts",
		path: "src/hooks/useAuth.ts",
		status: "M",
		staged: true,
	},
	{
		name: "RetryStrategy.ts",
		path: "src/lib/RetryStrategy.ts",
		status: "A",
		staged: true,
	},
];

export const unstagedFiles: GitFile[] = [
	{ name: "api.ts", path: "src/lib/api.ts", status: "M", staged: false },
	{ name: "types.ts", path: "src/types/types.ts", status: "M", staged: false },
	{
		name: "ErrorBoundary.tsx",
		path: "src/components/ErrorBoundary.tsx",
		status: "M",
		staged: false,
	},
	{
		name: "api.test.ts",
		path: "src/lib/api.test.ts",
		status: "A",
		staged: false,
	},
];

// Legacy fileTree for backward compat
export const fileTree = [
	{ name: "SettingsPanel.tsx", status: "modified", selected: true },
	{ name: "DarkModeToggle.tsx", status: "added" },
	{ name: "ThemeContext.tsx", status: "modified" },
	{ name: "index.css", status: "modified" },
];

// Message type
export type ChatMessage = {
	role: string;
	content: string;
	tool?: { name: string; file?: string; command?: string; query?: string };
	inlineDiff?: boolean;
	diffVariant?: string;
};
