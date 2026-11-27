import { z } from "zod";
import { ROOM_CODE_LENGTH } from "../rooms/RoomManager";

export const PLAYER_NAME_MAX = 16;

/**
 * Pseudo : espaces retirés aux extrémités, 1 à 16 caractères, sans caractères de
 * contrôle ni invisibles (\p{C}) qui pourraient casser l'affichage des autres joueurs.
 */
export const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_NAME_MAX)
  .regex(/^[^\p{C}]+$/u);

/** Code de salon : insensible à la casse, 4 lettres. */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z]{${ROOM_CODE_LENGTH}}$`));

export const createRoomSchema = z.object({ name: playerNameSchema });
export const joinRoomSchema = z.object({ code: roomCodeSchema, name: playerNameSchema });
