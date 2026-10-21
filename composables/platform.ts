import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, appDataDir, resourceDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-shell";

// The app uses WebView2 on Windows and WKWebView on macOS.
export const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
export const isMacOS = typeof navigator !== "undefined" && /Macintosh|Mac OS X/i.test(navigator.userAgent);
// Browser previews retain usable fallback controls; only the native macOS host draws traffic lights.
export const usesNativeWindowControls = isTauri() && isMacOS;
export const dataBaseDir = () => (isWindows ? BaseDirectory.Resource : BaseDirectory.AppData);
export const getDataDir = () => (!isTauri() ? Promise.resolve("/") : isWindows ? resourceDir() : appDataDir());
export const openFolder = (path: string) => open(path);
