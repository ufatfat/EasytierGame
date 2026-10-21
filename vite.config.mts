import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { fileURLToPath, URL } from "node:url";
import { coordinatorDevMiddleware } from "./scripts/coordinator-dev.mts";
export default defineConfig({
	base: "./",
	envDir: "env",
	clearScreen: false,
	resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)), "~": fileURLToPath(new URL(".", import.meta.url)) } },
	plugins: [
		vue(),
		vueJsx(),
		Components({ dts: false, resolvers: [ElementPlusResolver()] }),
		{
			name: "coordinator-dev-only",
			apply: "serve",
			configureServer(server) {
				server.middlewares.use("/__coordinator", coordinatorDevMiddleware);
			}
		}
	],
	css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
	server: {
		host: "127.0.0.1",
		port: 5173,
		strictPort: true,
		watch: { ignored: ["**/src-tauri/**", "**/service/data/**", "**/.output/**", "**/dist/**"] }
	},
	build: {
		target: process.env.TAURI_PLATFORM === "windows" ? "chrome105" : "safari13",
		sourcemap: !!process.env.TAURI_DEBUG,
		chunkSizeWarningLimit: 700
	}
});
