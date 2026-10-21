<template>
	<section class="panel-window">
		<PanelHeader
			icon="gamepad-2"
			title="游戏库"
			subtitle="管理本地游戏，一键启动"
		>
			<button
				class="ui-button primary"
				@click="handleCreate"
			>
				<AppIcon
					name="plus"
					:size="14"
				/>
				添加游戏
			</button>
		</PanelHeader>
		<div class="games-toolbar">
			<label class="game-search">
				<AppIcon
					name="search"
					:size="15"
				/>
				<input
					v-model="searchValue"
					placeholder="搜索游戏名称…"
					aria-label="搜索游戏"
				/>
			</label>
			<button
				class="ui-button"
				@click="openCoverDir"
			>
				<AppIcon
					name="folder"
					:size="14"
				/>
				封面目录
			</button>
		</div>
		<div class="games-content panel-scroll">
			<div class="games-grid">
				<article
					v-for="(item, idx) in computedGameList"
					:key="item.id"
					class="game-card surface-card"
				>
					<div class="game-cover">
						<img
							v-if="coverFor(item)"
							:src="coverFor(item) || undefined"
							alt=""
							@error="handleImgError(item, idx)"
						/>
						<AppIcon
							v-else
							name="gamepad-2"
							:size="40"
						/>
						<div class="game-overlay">
							<button
								class="ui-button primary"
								@click="handleStartGame(item)"
							>
								<AppIcon
									name="play"
									:size="14"
								/>
								启动游戏
							</button>
						</div>
					</div>
					<div class="game-information">
						<strong>{{ item.name }}</strong>
						<div>
							<span>本地游戏</span>
							<button
								class="icon-button"
								aria-label="编辑游戏"
								@click="handleEditItem(item)"
							>
								<AppIcon
									name="pencil"
									:size="13"
								/>
							</button>
							<button
								class="icon-button"
								aria-label="删除游戏"
								@click="handleDeleteItem(item)"
							>
								<AppIcon
									name="trash-2"
									:size="13"
								/>
							</button>
						</div>
					</div>
				</article>
				<button
					class="add-game"
					@click="handleCreate"
				>
					<span>
						<AppIcon
							name="plus"
							:size="24"
						/>
					</span>
					<strong>添加本地游戏</strong>
					<small>{{ isWindows ? "支持从桌面拖放快捷方式" : "选择 Mac 上的应用或游戏" }}</small>
				</button>
			</div>
			<p class="game-hint">
				<AppIcon
					name="info"
					:size="13"
				/>
				游戏在本机启动，联机前请先进入相同房间
			</p>
		</div>
		<ElDialog
			width="95%"
			top="30px"
			append-to-body
			:z-index="10"
			class="!mb-0"
			v-model="createGameData.visible"
			:close-on-press-escape="false"
			:title="`${createGameData.isEdit ? '编辑' : '新建'}本地游戏`"
		>
			<ElForm
				hide-required-asterisk
				label-position="left"
				:model="createGameData.form"
				:rules="createGameData.rules"
				ref="formRef"
			>
				<ElFormItem
					label="游戏名字"
					prop="name"
				>
					<ElInput
						v-model="createGameData.form.name"
						placeholder="请输入游戏名字"
					></ElInput>
				</ElFormItem>
				<ElFormItem
					label="执行文件"
					prop="exePath"
				>
					<ElInput
						v-model="createGameData.form.exePath"
						placeholder="请选择游戏执行文件"
					>
						<template #append>
							<ElButton
								size="small"
								type="primary"
								@click.stop="handleBrowser('exePath')"
							>
								浏览
							</ElButton>
						</template>
					</ElInput>
				</ElFormItem>
				<ElFormItem
					label="游戏封面"
					prop="showImg"
				>
					<ElBadge :hidden="createGameData.form.showImg == defaultPng">
						<template #content="{ value }">
							<div
								class="cursor-pointer"
								@click.stop="handleBadgeDeleteCover"
							>
								<ElIcon>
									<DeleteFilled />
								</ElIcon>
							</div>
						</template>
						<img
							@click.stop="handleBrowser('showImg')"
							:src="showImgConvertFileSrc(createGameData.form.showImg)"
							class="aspect-[1] w-[120px] cursor-pointer object-cover"
						/>
					</ElBadge>
				</ElFormItem>
			</ElForm>
			<template #footer>
				<div><ElText type="warning">除了默认封面以外，自定义封面会集中保存在封面目录里</ElText></div>
				<ElButton
					size="default"
					type="primary"
					@click="handleSave"
				>
					保存
				</ElButton>
				<ElButton
					size="default"
					@click="createGameData.visible = false"
				>
					关闭
				</ElButton>
			</template>
		</ElDialog>
	</section>
</template>
<script lang="ts" setup>
	import AppIcon from "@/components/AppIcon.vue";
	import PanelHeader from "@/components/PanelHeader.vue";
	import { gameArtwork } from "@/composables/gameCatalog";
	import { isWindows, dataBaseDir, getDataDir as getResourceDir, openFolder } from "@/composables/platform";
	import { VideoPlay, DeleteFilled, EditPen, Plus, Delete } from "@element-plus/icons-vue";
	import { dataSubscribe } from "~/composables/windows";
	import { BaseDirectory, basename, extname, join } from "@tauri-apps/api/path";
	import { convertFileSrc, Resource, isTauri } from "@tauri-apps/api/core";
	import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef } from "vue";
	import useMainStore from "@/stores/index";
	import { uniqueId } from "lodash-es";
	import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
	import { ElMessage, type FormInstance } from "element-plus";
	import { ATJ, bounce } from "~/utils";
	import { ElConfirmDanger } from "~/utils/element";
	import { copyFile, exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
	import { Command, open } from "@tauri-apps/plugin-shell";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";

	const resourceDir = await getResourceDir();
	const gameListResourceDir = isTauri() ? await join(resourceDir, import.meta.env.VITE_GAME_LIST_PATH) : "/";
	// const defaultLocalIconPath = await join(configPath, "icon.png");
	// const tauriPath = convertFileSrc(defaultLocalIconPath);
	const mainStore = useMainStore();
	const formEl = useTemplateRef<FormInstance>("formRef");
	const searchValue = ref("");
	const defaultPng = "/default.png";
	// const b = bounce(600);
	type gameItemType = { name: string; exePath: string; id: string; showImg: string };
	const createGameData = reactive({
		visible: false,
		isEdit: false,
		form: {
			id: "",
			name: "",
			exePath: "",
			showImg: defaultPng
		},
		rules: {
			name: [{ required: true, message: "请输入游戏名", trigger: "blur" }],
			exePath: [{ required: true, message: "请选择游戏执行文件", trigger: "blur" }]
		}
	});

	const computedGameList = computed(() => {
		if (!searchValue.value.trim()) return mainStore.gameList;
		return mainStore.gameList.filter(item => {
			return item.name.includes(searchValue.value); // 过滤
		});
	});

	const handleCreate = async () => {
		createGameData.isEdit = false;
		createGameData.form = {
			id: "",
			name: "",
			exePath: "",
			showImg: defaultPng
		};
		await nextTick();
		createGameData.visible = true;
	};

	const handleBrowser = async (type: "showImg" | "exePath") => {
		if (!isTauri()) return ElMessage.info("请在桌面客户端中选择本地文件");
		const filters =
			type === "showImg" ? [{ name: "", extensions: ["png", "jpg", "jpeg"] }] : [{ name: "", extensions: isWindows ? ["exe"] : ["app"] }];
		const file = await dialogOpen({
			multiple: false,
			directory: type === "exePath" && !isWindows,
			filters
		});
		if (file) {
			if (type === "showImg") {
				if (file) {
					if (!createGameData.form.id) {
						const time = new Date().getTime();
						createGameData.form.id = uniqueId(`${time}`);
					}
					let showImg = file;
					const game_list_path = import.meta.env.VITE_GAME_LIST_PATH;
					const isExists = await exists(game_list_path, { baseDir: dataBaseDir() });
					if (!isExists) {
						try {
							await mkdir(game_list_path, { baseDir: dataBaseDir() });
						} catch (err) {}
					}
					const toPath = await join(gameListResourceDir, createGameData.form.id);
					const suffix = showImg.split(".").pop();
					const toPathFileName = `${toPath}.${suffix}`;
					if (showImg != toPathFileName) {
						await copyFile(showImg, toPathFileName);
					}
					// console.log(toPathFileName);
					const isExistsToPath = await exists(toPathFileName);
					if (isExistsToPath) {
						const baseName = await basename(toPathFileName);
						createGameData.form = { ...createGameData.form, showImg: `${baseName}` }; // 如果复制正确，那就存储文件名即可
					}
				}
			}
			if (type === "exePath") {
				createGameData.form.exePath = file;
			}
		} else {
			ElMessage.error("获取文件路径失败");
		}
	};

	const openCoverDir = async () => {
		if (!isTauri()) return ElMessage.info("请在桌面客户端中打开封面目录");
		const game_list_path = import.meta.env.VITE_GAME_LIST_PATH;
		const isExists = await exists(game_list_path, { baseDir: dataBaseDir() });
		if (!isExists) {
			try {
				await mkdir(game_list_path, { baseDir: dataBaseDir() });
			} catch (err) {}
		}
		await openFolder(gameListResourceDir);
	};

	const handleSave = async () => {
		const [error, _] = await ATJ(formEl.value?.validate() as Promise<boolean>);
		if (!error) {
			if (createGameData.form.showImg == defaultPng) {
				//删除本地封面图
				// const toPath = await join(gameListResourceDir, createGameData.form.id);
				// const imgPath = `${toPath}.${suffix}`;
				// await remove(imgPath);
			}

			if (!createGameData.form.id) createGameData.form.id = crypto.randomUUID();
			const idx = mainStore.gameList.findIndex(i => i.id == createGameData.form.id);
			if (idx >= 0) {
				mainStore.gameList[idx] = { ...createGameData.form };
				mainStore.$patch({
					gameList: [...mainStore.gameList]
				});
			} else {
				mainStore.$patch({
					gameList: [...mainStore.gameList, createGameData.form]
				});
			}

			ElMessage.success("保存成功");
			createGameData.visible = false;
			// await openFolder(gameListResourceDir);
		}
	};

	const handleBadgeDeleteCover = async () => {
		await removeFileById(createGameData.form.id);
		createGameData.form = { ...createGameData.form, showImg: defaultPng };
	};

	const removeFileById = async (id: string) => {
		if (!isTauri()) return;
		if (!id) return;
		const isExists = await exists(gameListResourceDir);
		if (!isExists) return;
		const entries = await readDir(gameListResourceDir);
		if (entries.length > 0) {
			for (const entry of entries) {
				if (entry.name.includes(id + ".")) {
					const imgPath = await join(gameListResourceDir, entry.name);
					const isExists = await exists(imgPath);
					if (!isExists) continue;
					await remove(imgPath);
				}
			}
		}
	};

	const handleDeleteItem = async ({ id }: gameItemType) => {
		if (id) {
			const [error, _] = await ElConfirmDanger("确定要删除吗？");
			if (!error) {
				await removeFileById(id);
				mainStore.$patch({
					gameList: mainStore.gameList.filter(i => i.id !== id)
				});
			}
		}
	};

	const handleEditItem = async (item: gameItemType) => {
		createGameData.isEdit = true;
		createGameData.form = { ...item };
		createGameData.visible = true;
	};

	const handleStartGame = async (item: gameItemType) => {
		if (!isTauri()) return ElMessage.info("请在桌面客户端中启动本地游戏");
		try {
			const isExists = await exists(item.exePath);
			if (!isExists) {
				return ElMessage.error("执行文件不存在");
			}
		} catch (err) {
			return ElMessage.error("执行文件不存在");
		}

		ElMessage.info("正在启动游戏，请稍后...");
		const _child = await open(item.exePath);
	};

	const handleImgError = (item: gameItemType, idx: number) => {
		item.showImg = defaultPng;
		mainStore.gameList[idx] = { ...item };
		mainStore.$patch({
			gameList: [...mainStore.gameList]
		});
	};

	const coverFor = (item: gameItemType) => (item.showImg === defaultPng ? gameArtwork(item.name, true) : showImgConvertFileSrc(item.showImg));
	const showImgConvertFileSrc = (showImg: string) => {
		if (showImg == defaultPng || !isTauri()) return defaultPng;
		showImg = /^[a-z]\:/g.test(showImg.toLowerCase())
			? `${convertFileSrc(showImg)}?${new Date().getTime()}`
			: `${convertFileSrc(`${gameListResourceDir}/${showImg}`)}?${new Date().getTime()}`;
		return showImg;
	};

	let unlistenDragDrop: UnlistenFn | null = null;
	const listenDragDrop = async () => {
		unlistenDragDrop = await listen<{ paths: string[]; position: { x: number; y: number } }>("tauri://drag-drop", async e => {
			const AllFiles = e.payload.paths;
			let result: Array<gameItemType> = [];
			const date = new Date().getTime();
			const showImg = defaultPng;
			const extUrls = [];
			const lnkFiles = [];
			for (const item of AllFiles) {
				if (item.endsWith(".url")) {
					extUrls.push(item);
				} else {
					lnkFiles.push(item);
				}
			}

			if (lnkFiles.length > 0) {
				// console.log(lnkFiles)
				if (!isWindows) return ElMessage.warning("快捷方式导入仅支持 Windows，请使用添加游戏选择 macOS 应用");
				let lnkFilesstr = "$lnkFiles = @(";
				for (let i = 0; i < lnkFiles.length; i++) {
					lnkFilesstr = lnkFilesstr + `\"${lnkFiles[i]}\"`;
					if (i == lnkFiles.length - 1) {
						lnkFilesstr = lnkFilesstr + ");";
					} else {
						lnkFilesstr = lnkFilesstr + ",";
					}
				}
				let forstr =
					lnkFilesstr +
					`
					$shell = New-Object -ComObject WScript.Shell;
					$results = @();
					foreach ($lnkFile in $lnkFiles) {
						$shortcut = $shell.CreateShortcut($lnkFile);
						$targetPath = $shortcut.TargetPath;
						$iconLocation = $shortcut.IconLocation;
						$results += [PSCustomObject]@{
							TargetPath = $targetPath
							LinkFile = $lnkFile
						};
					};
					$results | ConvertTo-Json
				`;
				let outputtarget = await Command.create("powershell", [`${forstr}`], {
					encoding: "GBK"
				}).execute();
				let res: {
					TargetPath: string;
					LinkFile: string;
				}[] = JSON.parse(outputtarget.stdout);
				if (res && !Array.isArray(res)) {
					res = [res];
				}
				if (res.length > 0) {
					for (const idx in res) {
						const item = res[idx];
						// console.log(item);
						const id = `${date}-${idx}`;
						const exePath = item.TargetPath || item.LinkFile;
						const namePath = item.LinkFile || item.TargetPath;
						const allName = await basename(namePath);
						const extName = await extname(namePath);
						result.push({
							exePath: exePath,
							name: allName.replace(`.${extName}`, ""),
							id,
							showImg
						});
					}
				}
			}
			if (extUrls.length > 0) {
				for (const idx in extUrls) {
					const TargetPath = extUrls[idx];
					const id = `${date}-${idx}-url`;
					const allName = await basename(TargetPath);
					const extName = await extname(TargetPath);
					result.push({
						exePath: TargetPath,
						name: allName.replace(`.${extName}`, ""),
						id,
						showImg
					});
				}
			}

			if (result.length > 0) {
				mainStore.$patch({
					gameList: [...mainStore.gameList, ...result]
				});
			}
		});
	};

	// 兼容新的存储方式
	const compatibleGameList = async () => {
		const gameList = [...mainStore.gameList];
		if (gameList.length <= 0) return;
		const newGameList = [];
		for (const item of gameList) {
			const newItem = { ...item };
			if (newItem.showImg != defaultPng && /^[a-z]\:/g.test(newItem.showImg.toLowerCase())) {
				newItem.showImg = await basename(item.showImg);
				if (Reflect.has(newItem, "coverImg")) {
					delete newItem["coverImg"];
				}
			}
			newGameList.push(newItem);
		}
		mainStore.$patch({
			gameList: newGameList
		});
	};

	onMounted(async () => {
		if (!isTauri()) return;
		await compatibleGameList();
		listenDragDrop(); //监听拖放
	});

	onBeforeUnmount(() => {
		unlistenDragDrop && unlistenDragDrop();
	});

	dataSubscribe();
</script>

<style scoped>
	.games-toolbar {
		display: flex;
		gap: 8px;
		align-items: center;
		padding: 14px 20px;
	}
	.game-search {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		height: 34px;
		padding: 0 10px;
		flex: 1;
		color: var(--text-3);
	}
	.game-search input {
		background: transparent;
		border: 0;
		outline: none;
		font-size: 12px;
		min-width: 0;
		width: 100%;
		color: var(--text-1);
	}
	.games-content {
		padding: 0 20px 20px;
	}
	.games-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.game-card {
		overflow: hidden;
		min-width: 0;
	}
	.game-cover {
		height: 150px;
		background: var(--surface-3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-3);
		position: relative;
	}
	.game-cover > img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.game-overlay {
		position: absolute;
		inset: 0;
		background: #0006;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.game-card:hover .game-overlay,
	.game-card:focus-within .game-overlay {
		opacity: 1;
	}
	.game-information {
		padding: 10px 12px;
	}
	.game-information strong {
		font-size: 12px;
		font-weight: 600;
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.game-information > div {
		display: flex;
		align-items: center;
		margin-top: 3px;
		font-size: 10px;
		color: var(--text-3);
	}
	.game-information > div span {
		flex: 1;
	}
	.game-information .icon-button {
		width: 22px;
		height: 22px;
	}
	.add-game {
		border: 1px dashed var(--border);
		border-radius: 10px;
		min-height: 213px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 9px;
		background: transparent;
		color: var(--text-3);
	}
	.add-game > span {
		background: var(--surface-2);
		border-radius: 50%;
		padding: 12px;
	}
	.add-game strong {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-2);
	}
	.add-game small {
		font-size: 10px;
	}
	.game-hint {
		font-size: 10px;
		color: var(--text-3);
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 16px;
	}
	@media (max-width: 480px) {
		.games-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
