<template>
	<button
		type="button"
		class="ui-switch"
		:class="{ on: modelValue }"
		role="switch"
		:aria-checked="modelValue"
		:aria-label="label"
		:disabled="disabled"
		@click="$emit('update:modelValue', !modelValue)"
	>
		<span />
	</button>
</template>
<script setup lang="ts">
	defineProps<{ modelValue: boolean; label: string; disabled?: boolean }>();
	defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>
