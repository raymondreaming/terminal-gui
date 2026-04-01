import { Electroview } from "electrobun/view";

// ── Electrobun RPC type (shared with src/bun/index.ts) ──

type WindowControlsRPC = {
	bun: {
		requests: {
			closeWindow: { params: undefined; response: undefined };
			minimizeWindow: { params: undefined; response: undefined };
			toggleMaximizeWindow: {
				params: undefined;
				response: { maximized: boolean };
			};
		};
		messages: Record<string, never>;
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};

// ── Window controls (RPC to bun process) ──

const isElectrobunRuntime =
	typeof window !== "undefined" &&
	typeof window.__electrobunWindowId === "number";

const windowRpc = isElectrobunRuntime
	? Electroview.defineRPC<WindowControlsRPC>({ handlers: {} })
	: null;

if (windowRpc) {
	new Electroview({ rpc: windowRpc });
}

function closeAppWindow() {
	return windowRpc?.requestProxy.closeWindow() ?? Promise.resolve(undefined);
}

function minimizeAppWindow() {
	return windowRpc?.requestProxy.minimizeWindow() ?? Promise.resolve(undefined);
}

function toggleAppWindowMaximize() {
	return (
		windowRpc?.requestProxy.toggleMaximizeWindow() ??
		Promise.resolve({ maximized: false })
	);
}

// ── Title bar UI ──

const WINDOW_CONTROLS = [
	{
		action: closeAppWindow,
		ariaLabel: "Close window",
		color: "bg-[#ff5f57]",
		hoverColor: "hover:bg-[#ff3b30]",
	},
	{
		action: minimizeAppWindow,
		ariaLabel: "Minimize window",
		color: "bg-[#febc2e]",
		hoverColor: "hover:bg-[#f5a623]",
	},
	{
		action: toggleAppWindowMaximize,
		ariaLabel: "Maximize window",
		color: "bg-[#28c840]",
		hoverColor: "hover:bg-[#1db934]",
	},
] as const;

export function AppTitleBar() {
	return (
		<header className="electrobun-webkit-app-region-drag flex h-6 shrink-0 items-center bg-surgent-bg px-3.5 select-none">
			{isElectrobunRuntime ? (
				<div className="electrobun-webkit-app-region-no-drag flex items-center gap-[7px]">
					{WINDOW_CONTROLS.map(({ action, ariaLabel, color, hoverColor }) => (
						<button
							key={ariaLabel}
							type="button"
							aria-label={ariaLabel}
							className={`h-[12px] w-[12px] rounded-full ${color} ${hoverColor} transition-colors focus:outline-none`}
							onClick={() => {
								void action();
							}}
						/>
					))}
				</div>
			) : null}
		</header>
	);
}
