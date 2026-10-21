<template>
	<header
		class="panel-header"
		:class="{ 'native-macos-titlebar': usesNativeWindowControls }"
		data-tauri-drag-region
	>
		<AppIcon
			:name="icon"
			:size="18"
			class="text-primary"
		/>
		<div
			class="panel-heading"
			data-tauri-drag-region
		>
			<h1>{{ title }}</h1>
			<p v-if="subtitle">{{ subtitle }}</p>
		</div>
		<slot />
		<button
			v-if="!usesNativeWindowControls"
			class="icon-button panel-close"
			aria-label="关闭面板"
			@click="close"
		>
			<AppIcon name="x" />
		</button>
	</header>
</template>
<script setup lang="ts">
	import { isTauri } from "@tauri-apps/api/core";
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { usesNativeWindowControls } from "@/composables/platform";
	import AppIcon from "@/components/AppIcon.vue";
	defineProps<{ icon: string; title: string; subtitle?: string }>();
	const close = () => {
		if (isTauri()) void getCurrentWindow().close();
		else window.location.hash = "/";
	};
</script>
