import "./index.css";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { Sidebar } from "./components/layout/Sidebar.tsx";
import { applyAppTheme, loadAppThemeId } from "./lib/app-theme.ts";
import { GitPage } from "./pages/GitPage";
import { PromptsPage } from "./pages/PromptsPage";
import { TerminalPage } from "./pages/Terminal";

for (const attrs of [
	{ rel: "manifest", href: "/manifest.json" },
	{ rel: "icon", type: "image/png", href: "/app-icon.png" },
	{ rel: "apple-touch-icon", href: "/app-icon.png" },
]) {
	const el = document.createElement("link");
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	document.head.appendChild(el);
}

applyAppTheme(loadAppThemeId());

const root = createRoot(document.getElementById("root")!);
root.render(
	<ErrorBoundary>
		<BrowserRouter>
			<div className="flex h-screen bg-surgent-bg">
				<Sidebar />
				<main className="min-w-0 flex-1 overflow-hidden">
					<Routes>
						<Route path="/" element={<Navigate to="/terminal" replace />} />
						<Route path="/terminal" element={<TerminalPage />} />
						<Route path="/git" element={<GitPage />} />
						<Route path="/prompts" element={<PromptsPage />} />
					</Routes>
				</main>
			</div>
		</BrowserRouter>
	</ErrorBoundary>
);
