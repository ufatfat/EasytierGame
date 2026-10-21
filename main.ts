import { createApp } from "vue";
import { createPinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import App from "./app.vue";
import router from "./router";
import "./assets/css/tailwind.css";
import "./assets/css/main.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import "element-plus/es/components/loading/style/css";
import "./assets/css/design-system.css";
import useMainStore from "./stores";

const app = createApp(App),
	pinia = createPinia();
pinia.use(createPersistedState({ key: id => `__glj_persisted_${id}`, storage: localStorage }));
app.use(pinia);
app.use(router);
const store = useMainStore(pinia);
// One settings listener per WebView, regardless of the number of mounted components.
window.addEventListener("storage", event => {
	if (event.storageArea !== localStorage || event.key !== "__glj_persisted_main" || !event.newValue) return;
	store.$hydrate({ runHooks: false });
	window.dispatchEvent(new Event("etg:settings-updated"));
});
if (import.meta.env.PROD)
	document.addEventListener("contextmenu", event => {
		const target = event.target as HTMLElement;
		if (!target.closest("input,textarea,[contenteditable],.allow-contextmenu")) event.preventDefault();
	});
void router.isReady().then(() => app.mount("#__easytier"));

// A native tray hide/show does not consistently update document.visibilityState on every OS.
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
if (isTauri())
	void getCurrentWindow()
		.onFocusChanged(event => {
			if (event.payload) window.dispatchEvent(new Event("etg:window-visible"));
		})
		.catch(console.error);
