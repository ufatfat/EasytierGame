import monster from "@/assets/game-covers/monster-hunter-room.png";
import deepRock from "@/assets/game-covers/deep-rock-room.png";
import terraria from "@/assets/game-covers/terraria-room.png";
import minecraft from "@/assets/game-covers/minecraft-room.png";
import borderlands from "@/assets/game-covers/borderlands-room.png";
import monsterLarge from "@/assets/game-covers/monster-hunter.png";
import deepRockLarge from "@/assets/game-covers/deep-rock.png";
import terrariaLarge from "@/assets/game-covers/terraria.png";
import borderlandsLarge from "@/assets/game-covers/borderlands.png";
import elden from "@/assets/game-covers/elden-ring.png";
export const gameCatalog = [
	{ name: "怪物猎人：世界", short: "怪物猎人", cover: monster, large: monsterLarge },
	{ name: "深岩银河", short: "深岩银河", cover: deepRock, large: deepRockLarge },
	{ name: "泰拉瑞亚", short: "泰拉瑞亚", cover: terraria, large: terrariaLarge },
	{ name: "我的世界", short: "我的世界", cover: minecraft, large: minecraft },
	{ name: "无主之地 3", short: "无主之地", cover: borderlands, large: borderlandsLarge },
	{ name: "艾尔登法环", short: "艾尔登法环", cover: elden, large: elden }
];
export const gameArtwork = (name: string, large = false) => {
	const game = gameCatalog.find(game => name.includes(game.short));
	return game ? (large ? game.large : game.cover) : null;
};
