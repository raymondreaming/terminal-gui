import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { TerminalShellHeader } from "./components/layout/TerminalShellHeader.tsx";
import { applyAppTheme, loadAppThemeId } from "./lib/app-theme.ts";
import { getServerOrigin, resolveServerUrl } from "./lib/server-origin.ts";

const TerminalPage = lazy(() =>
	import("./pages/Terminal").then((m) => ({ default: m.TerminalPage }))
);
const GitPage = lazy(() =>
	import("./pages/GitPage").then((m) => ({ default: m.GitPage }))
);
const PromptsPage = lazy(() =>
	import("./pages/PromptsPage").then((m) => ({ default: m.PromptsPage }))
);
const ProfilePage = lazy(() =>
	import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);

if (window.location.origin !== getServerOrigin()) {
	const originalFetch = window.fetch.bind(window);
	window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
		if (typeof input === "string" && input.startsWith("/")) {
			return originalFetch(resolveServerUrl(input), init);
		}
		if (input instanceof URL && input.pathname.startsWith("/")) {
			return originalFetch(
				resolveServerUrl(`${input.pathname}${input.search}`),
				init
			);
		}
		if (input instanceof Request) {
			const url = new URL(input.url, window.location.origin);
			if (url.pathname.startsWith("/")) {
				return originalFetch(
					new Request(resolveServerUrl(`${url.pathname}${url.search}`), input),
					init
				);
			}
		}
		return originalFetch(input, init);
	};
}

applyAppTheme(loadAppThemeId());

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Missing root element.");
}

const root = createRoot(rootElement);
root.render(
	<ErrorBoundary>
		<HashRouter>
			<div className="flex h-screen flex-col bg-inferay-bg">
				<div className="electrobun-webkit-app-region-drag h-6 shrink-0 bg-inferay-bg" />
				<div className="flex min-h-0 flex-1">
					<Sidebar />
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
						<TerminalShellHeader />
						<main className="min-w-0 flex-1 overflow-hidden">
							<Suspense fallback={null}>
								<Routes>
									<Route
										path="/"
										element={<Navigate to="/terminal" replace />}
									/>
									<Route path="/terminal" element={<TerminalPage />} />
									<Route path="/git" element={<GitPage />} />
									<Route path="/prompts" element={<PromptsPage />} />
									<Route path="/profile" element={<ProfilePage />} />
								</Routes>
							</Suspense>
						</main>
					</div>
				</div>
			</div>
		</HashRouter>
	</ErrorBoundary>
);
