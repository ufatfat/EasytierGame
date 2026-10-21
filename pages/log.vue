<template>
	<section class="panel-page log-page">
		<PanelHeader
			icon="scroll-text"
			title="运行日志"
			subtitle="EasyTier 内核实时输出"
		/>
		<RuntimeLog />
	</section>
</template>
<script setup lang="ts">
	import PanelHeader from "@/components/PanelHeader.vue";
	import RuntimeLog from "@/components/RuntimeLog.vue";
</script>
