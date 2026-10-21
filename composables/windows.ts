import { isTauri } from "@tauri-apps/api/core";
import { type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition, type WindowOptions, Window, currentMonitor, LogicalPosition } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { WebviewLabel, WebviewOptions } from "@tauri-apps/api/webview";
import { usesNativeWindowControls } from "./platform";
import useMainStore from "@/stores/index";
import { onBeforeUnmount, watch } from "vue";
import { updateConfigJsonBounce, type ConfigServerUrlType } from "./configJson";

const _listenersMaps = new Map<string, UnlistenFn>();
const dealCloseListener = async (dialog: WebviewWindow, label: string, beforeCloseFunc?: () => void | null) => {
	_listenersMaps.get(label)?.();
	const off = await dialog.onCloseRequested(async () => {
		await beforeCloseFunc?.();
		_listenersMaps.get(label)?.();
		_listenersMaps.delete(label);
	});
	_listenersMaps.set(label, off);
};
export default async (
	label: WebviewLabel,
	options?: Omit<WebviewOptions, "x" | "y" | "width" | "height"> & WindowOptions,
	afterCreatedFunc?: (webviewWindow: WebviewWindow, appWindow: Window) => void | null,
	beforeCloseFunc?: () => void | null
) => {
	if (!isTauri()) {
		window.location.hash = String(options?.url || `#/${label}`).replace(/^#/, "");
		return;
	}
	let dialog = await WebviewWindow.getByLabel(label);
	if (!dialog) {
		let defaultOpts: { [key: string]: any; parent: Window | undefined } = {
			parent: undefined,
			// macOS: the first click should activate the window and operate the control.
			acceptFirstMouse: true,
			closable: true,
			resizable: true,
			decorations: false,
			maximizable: false,
			minimizable: false,
			x: 0,
			y: 0
		};
		const appWindow = (await WebviewWindow.getByLabel("main")) || getCurrentWindow();
		defaultOpts.parent = appWindow;
		const factor = await appWindow.scaleFactor(),
			appPosition = await appWindow.outerPosition(),
			appSize = await appWindow.outerSize();
		const monitor = await currentMonitor();
		const opts = { ...options };
		let x = appPosition.x + appSize.width + Math.ceil(12 * factor),
			y = appPosition.y;
		if (monitor) {
			const area = monitor.workArea;
			const width = Math.min(Number(opts.width || 600), area.size.width / factor),
				height = Math.min(Number(opts.height || 720), area.size.height / factor);
			opts.width = width;
			opts.height = height;
			opts.minWidth = Math.min(Number(opts.minWidth || 360), width);
			opts.minHeight = Math.min(Number(opts.minHeight || 480), height);
			x = Math.max(area.position.x, Math.min(x, area.position.x + area.size.width - width * factor));
			y = Math.max(area.position.y, Math.min(y, area.position.y + area.size.height - height * factor));
			const mainX = x - appSize.width - Math.ceil(12 * factor);
			if (mainX >= area.position.x && x < appPosition.x + appSize.width) {
				await appWindow.setPosition(new PhysicalPosition(mainX, appPosition.y));
			}
		}
		const logical = new PhysicalPosition(x, y).toLogical(factor);
		defaultOpts.x = logical.x;
		defaultOpts.y = logical.y;
		dialog = new WebviewWindow(label, {
			...defaultOpts,
			...opts,
			...(usesNativeWindowControls
				? {
						decorations: true,
						titleBarStyle: "overlay",
						hiddenTitle: true,
						trafficLightPosition: new LogicalPosition(16, 18),
						minimizable: true,
						maximizable: true
					}
				: {})
		});
		await dealCloseListener(dialog, label, beforeCloseFunc);
		await dialog.show();
		afterCreatedFunc && (await afterCreatedFunc(dialog, appWindow));
	} else {
		const visible = await dialog.isVisible();
		if (visible) {
			await dialog.close();
		} else {
			const appWindow = getCurrentWindow();
			await dealCloseListener(dialog, label, beforeCloseFunc);
			await dialog.show();
			afterCreatedFunc && (await afterCreatedFunc(dialog, appWindow));
		}
	}
};

export const dataSubscribe = (cb?: () => unknown, getconfigServerUrl?: () => ConfigServerUrlType) => {
	const store = useMainStore();
	const updated = () => {
		if (cb) void cb();
	};
	window.addEventListener("etg:settings-updated", updated);
	// Only the main window owns config.json writes; one debounced write for relevant edits.
	const stop = getconfigServerUrl
		? watch(
				() => JSON.stringify([store.config, store.basePeers, store.createConfigInEasytier, getconfigServerUrl()]),
				() => {
					if (isTauri()) updateConfigJsonBounce(getconfigServerUrl());
				}
			)
		: undefined;
	onBeforeUnmount(() => {
		window.removeEventListener("etg:settings-updated", updated);
		stop?.();
	});
};
