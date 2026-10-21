import { createRouter, createWebHashHistory } from "vue-router";
export default createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: "/", component: () => import("./pages/index.vue") },
		{ path: "/member", component: () => import("./pages/member.vue") },
		{ path: "/log", component: () => import("./pages/log.vue") },
		{ path: "/cidr", component: () => import("./pages/cidr.vue") },
		{ path: "/advance", component: () => import("./pages/advance.vue") },
		{ path: "/tool", component: () => import("./pages/tool.vue") },
		{ path: "/server", component: () => import("./pages/server.vue") },
		{ path: "/gameList", component: () => import("./pages/gameList.vue") },
		{ path: "/community", component: () => import("./pages/community.vue") },
		{ path: "/lobby", component: () => import("./pages/lobby.vue") },
		{ path: "/nodesList", component: () => import("./pages/nodesList.vue") },
		{ path: "/:pathMatch(.*)*", redirect: "/" }
	]
});
