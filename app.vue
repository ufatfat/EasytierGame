<template>
	<RouterView v-slot="{ Component }">
		<Suspense><component :is="Component" /></Suspense>
	</RouterView>
</template>
<script setup lang="ts">
	import { RouterView } from "vue-router";
	import { watch, onBeforeUnmount } from "vue";
	import { isTauri } from "@tauri-apps/api/core";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { usesNativeWindowControls } from "@/composables/platform";
	import useMainStore from "@/stores/index";
	import { initTheme } from "@/composables/theme";
	import { warn, debug, trace, info, error } from "@tauri-apps/plugin-log";
	function forwardConsole(fnName: "log" | "debug" | "info" | "warn" | "error", logger: (message: string) => Promise<void>) {
		const original = console[fnName];
		console[fnName] = message => {
			original(message);
			try {
				if (typeof message === "string") {
					void logger(message).catch(() => {});
				} else {
					void logger(JSON.stringify(message)).catch(() => {});
				}
			} catch (e) {
				void logger(`${message}`).catch(() => {});
			}
		};
	}
	if (import.meta.env.PROD && isTauri()) {
		forwardConsole("warn", warn);
		forwardConsole("error", error);
	}

	const mainStore = useMainStore();
	// console.log(mainStore.theme)
	const preferred = matchMedia("(prefers-color-scheme: dark)");
	const applyTheme = () => {
		const dark = mainStore.themeMode === "system" ? preferred.matches : mainStore.themeMode === "dark";
		mainStore.theme = dark;
		initTheme(dark);
		if (usesNativeWindowControls)
			void getCurrentWindow()
				.setTheme(mainStore.themeMode === "system" ? null : dark ? "dark" : "light")
				.catch(console.error);
	};
	watch(() => mainStore.themeMode, applyTheme, { immediate: true });
	preferred.addEventListener("change", applyTheme);
	onBeforeUnmount(() => preferred.removeEventListener("change", applyTheme));
</script>
