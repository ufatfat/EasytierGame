<template>
	<div class="flex h-full flex-col gap-[10px]">
		<PanelHeader
			v-if="usesNativeWindowControls"
			icon="network"
			title="子网代理"
			subtitle="配置通过虚拟网络共享的局域网网段"
		/>
		<div class="flex items-center gap-[10px]">
			<ElRadioGroup
				:disabled="!data.isSwitchEnable"
				v-model="mainStore.cidrEnable"
			>
				<ElRadioButton :value="true">开启</ElRadioButton>
				<ElRadioButton :value="false">关闭</ElRadioButton>
			</ElRadioGroup>
			<div class="flex items-center gap-[10px]">
				<ElCheckbox v-model="mainStore.proxyForwardBySystem">通过系统内核转发子网代理数据包，禁用内置NAT</ElCheckbox>
				<CoreVersionWarning version="2.2.3" />
			</div>
		</div>
		<div class="flex-1 overflow-auto">
			<ElInput
				placeholder="例如: 192.168.1.0/24 一行一个"
				v-model="mainStore.config.proxyNetworks"
				type="textarea"
				:rows="5"
				resize="none"
			></ElInput>
			<ElTable
				stripe
				border
				empty-text="暂无数据"
				:data="data.route"
				class="mt-[5px]"
			>
				<ElTableColumn
					sortable
					width="140"
					label="主机名"
					prop="hostname"
				></ElTableColumn>
				<ElTableColumn
					width="120"
					sortable
					label="虚拟网IP"
					prop="ipv4"
				></ElTableColumn>
				<ElTableColumn
					sortable
					label="被代理的子网"
					prop="proxy_cidrs"
				></ElTableColumn>
			</ElTable>
		</div>
	</div>
</template>
<script setup lang="ts">
	import PanelHeader from "@/components/PanelHeader.vue";
	import { usesNativeWindowControls } from "@/composables/platform";
	import useMainStore from "@/stores";
	import { dataSubscribe } from "@/composables/windows";
	import { useRuntimeNetwork } from "@/composables/runtime";
	import { computed } from "vue";
	import CoreVersionWarning from "@/components/CoreVersionWarning.vue";
	const mainStore = useMainStore(),
		runtime = useRuntimeNetwork("routes");
	const data = computed(() => ({ route: mainStore.cidrEnable ? runtime.value.routes : [], isSwitchEnable: !runtime.value.client_running }));
	dataSubscribe();
</script>
