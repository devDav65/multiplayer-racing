import type { JoinRoomResult } from "@racing/shared";
import type { Room } from "./Room";

/** Lettres sans ambiguïté (pas de I/O, faciles à dicter). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;

/**
 * Gère tous les salons : création avec un code, entrée, sortie.
 * Un joueur est dans au plus un salon. Un salon vide est supprimé.
 * Ne connaît pas Socket.IO : la création d'une Room est déléguée à `createRoom`.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly playerRooms = new Map<string, Room>();
  private readonly createRoom: (code: string) => Room;
  private readonly random: () => number;

  constructor(createRoom: (code: string) => Room, random: () => number = Math.random) {
    this.createRoom = createRoom;
    this.random = random;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  roomOf(playerId: string): Room | undefined {
    return this.playerRooms.get(playerId);
  }

  /** `userId` : compte connecté (null pour un invité). */
  create(playerId: string, name: string, userId: number | null = null): JoinRoomResult {
    const code = this.newCode();
    if (!code) return { ok: false, error: "Impossible de créer un salon, réessaie." };
    const room = this.createRoom(code);
    this.rooms.set(code, room);
    return this.enter(playerId, room, name, userId);
  }

  join(playerId: string, code: string, name: string, userId: number | null = null): JoinRoomResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "Salon introuvable." };
    if (this.playerRooms.get(playerId) === room)
      return { ok: true, code, state: room.getRoomState() };
    return this.enter(playerId, room, name, userId);
  }

  /** Fait sortir le joueur de son salon. Renvoie le salon quitté, s'il y en avait un. */
  leave(playerId: string): Room | undefined {
    const room = this.playerRooms.get(playerId);
    if (!room) return undefined;
    this.playerRooms.delete(playerId);
    room.removePlayer(playerId);
    if (room.playerCount === 0) this.rooms.delete(room.code);
    return room;
  }

  private enter(playerId: string, room: Room, name: string, userId: number | null): JoinRoomResult {
    this.leave(playerId);
    if (!room.addPlayer(playerId, name, userId)) {
      if (room.playerCount === 0) this.rooms.delete(room.code);
      return { ok: false, error: "Salon plein." };
    }
    this.playerRooms.set(playerId, room);
    return { ok: true, code: room.code, state: room.getRoomState() };
  }

  /** Code libre au hasard. 24⁴ ≈ 330 000 codes : quelques essais suffisent. */
  private newCode(): string | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }
}
