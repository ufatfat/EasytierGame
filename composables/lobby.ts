import { invoke, isTauri } from "@tauri-apps/api/core";
import { coordinatorRequest } from "@/composables/coordinator";
export type Room = {
	id: string;
	member_id: string;
	member_name: string;
	title: string;
	game: string;
	tags: string[];
	description: string;
	capacity: number;
	member_count: number;
	servers: string[];
	network_name: string;
	password_mode: "ask" | "public";
	hide_when_full: boolean;
	auto_remove: boolean;
	created_at: string;
	heartbeat_at: string;
};
export type RoomConnection = Pick<Room, "id" | "servers" | "network_name" | "password_mode"> & { password?: string };
export type PublishRoom = Pick<
	Room,
	| "title"
	| "game"
	| "tags"
	| "description"
	| "capacity"
	| "servers"
	| "network_name"
	| "password_mode"
	| "member_count"
	| "hide_when_full"
	| "auto_remove"
> & { password?: string };
export const listRooms = () => coordinatorRequest<{ rooms: Room[]; mine: Room | null }>("/v1/rooms");
export const publishRoom = (body: PublishRoom) => coordinatorRequest<Room>("/v1/rooms", "POST", body);
export const editRoom = (id: string, body: Partial<Room>) => coordinatorRequest<Room>(`/v1/rooms/${id}`, "PATCH", body);
export const removeRoom = (id: string) => coordinatorRequest(`/v1/rooms/${id}`, "DELETE");
export const heartbeatRoom = (id: string, member_count: number) => coordinatorRequest(`/v1/rooms/${id}/heartbeat`, "PUT", { member_count });
export const roomConnection = (id: string) => coordinatorRequest<RoomConnection>(`/v1/rooms/${id}/connection`);
export type NetworkSnapshot = { running: boolean; connected: boolean; members: Member[] };
export const networkSnapshot = async (): Promise<NetworkSnapshot> =>
	isTauri() ? invoke("get_network_snapshot") : { running: false, connected: false, members: [] };
export const probeServer = async (server: string): Promise<number | null> => (isTauri() ? invoke("probe_server", { server }) : null);
