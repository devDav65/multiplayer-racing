import {
  MAX_PLAYERS_PER_ROOM,
  SIM_DT,
  SIM_TICK_RATE,
  SNAPSHOT_RATE,
  createCarState,
  stepCarOnTrack,
  type CarControls,
  type CarState,
  type PlayerInput,
  type Snapshot,
  type Track,
} from "@racing/shared";

interface Player {
  id: string;
  /** Emplacement sur la grille de départ. */
  slot: number;
  car: CarState;
  /** Dernières touches reçues : rejouées à chaque pas jusqu'à ce que de nouvelles arrivent. */
  controls: CarControls;
  lastInputSeq: number;
}

const IDLE_CONTROLS: CarControls = { throttle: 0, steer: 0, brake: 0, handbrake: false };
const TICKS_PER_SNAPSHOT = SIM_TICK_RATE / SNAPSHOT_RATE;
const GRID_ROW_SPACING = 8; // mètres entre deux rangées
const GRID_LANE_OFFSET = 3.5; // mètres entre l'axe de la piste et chaque colonne

/** Position de départ du joueur n° `slot` : grille de 2 colonnes derrière la ligne. */
function gridPosition(track: Track, slot: number): CarState {
  const { x, z, heading } = track.spawn;
  const forwardX = -Math.sin(heading);
  const forwardZ = -Math.cos(heading);
  const rightX = Math.cos(heading);
  const rightZ = -Math.sin(heading);
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  return createCarState(
    x - forwardX * row * GRID_ROW_SPACING + rightX * side * GRID_LANE_OFFSET,
    z - forwardZ * row * GRID_ROW_SPACING + rightZ * side * GRID_LANE_OFFSET,
    heading,
  );
}

/**
 * Un salon : l'état de toutes les voitures et la boucle de simulation.
 * Ne connaît PAS Socket.IO : la diffusion passe par le callback `onSnapshot`.
 */
export class Room {
  private readonly track: Track;
  private readonly onSnapshot: (snapshot: Snapshot) => void;
  private readonly players = new Map<string, Player>();
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastTime = 0;
  private accumulator = 0;

  constructor(track: Track, onSnapshot: (snapshot: Snapshot) => void) {
    this.track = track;
    this.onSnapshot = onSnapshot;
  }

  get playerCount(): number {
    return this.players.size;
  }

  /** Renvoie false si le salon est plein. */
  addPlayer(id: string): boolean {
    if (this.players.has(id) || this.players.size >= MAX_PLAYERS_PER_ROOM) return false;

    // Premier emplacement de grille libre.
    const usedSlots = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (usedSlots.has(slot)) slot++;

    this.players.set(id, {
      id,
      slot,
      car: gridPosition(this.track, slot),
      controls: IDLE_CONTROLS,
      lastInputSeq: 0,
    });
    this.start();
    return true;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (this.players.size === 0) this.stop();
  }

  /** Reçoit des touches DÉJÀ validées. On ne garde que les champs de conduite. */
  applyInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id);
    if (!player) return;
    // WebSocket (TCP) garde l'ordre des messages : pas besoin de trier par `seq`.
    player.controls = {
      throttle: input.throttle,
      steer: input.steer,
      brake: input.brake,
      handbrake: input.handbrake,
    };
    player.lastInputSeq = input.seq;
  }

  private start(): void {
    if (this.timer) return;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.timer = setInterval(() => this.onTimer(), 1000 / SIM_TICK_RATE);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * setInterval n'est pas précis (il peut arriver en retard ou en avance).
   * Même solution que côté client : un accumulateur de temps réel et des pas FIXES.
   */
  private onTimer(): void {
    const now = performance.now();
    this.accumulator += Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    while (this.accumulator >= SIM_DT) {
      this.step();
      this.accumulator -= SIM_DT;
    }
  }

  private step(): void {
    for (const player of this.players.values()) {
      player.car = stepCarOnTrack(player.car, player.controls, this.track);
    }
    this.tick++;
    if (this.tick % TICKS_PER_SNAPSHOT === 0) {
      this.onSnapshot(this.createSnapshot());
    }
  }

  private createSnapshot(): Snapshot {
    return {
      tick: this.tick,
      serverTime: Date.now(),
      cars: [...this.players.values()].map((p) => ({
        id: p.id,
        x: p.car.x,
        z: p.car.z,
        heading: p.car.heading,
        vx: p.car.vx,
        vz: p.car.vz,
        lastInputSeq: p.lastInputSeq,
      })),
    };
  }
}