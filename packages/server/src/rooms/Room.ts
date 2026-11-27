import {
  type CarState,
  createCarState,
  MAX_PLAYERS_PER_ROOM,
  type PlayerInput,
  SIM_DT,
  SIM_TICK_RATE,
  SNAPSHOT_RATE,
  type Snapshot,
  stepCarOnTrack,
  type Track,
} from "@racing/shared";

interface Player {
  id: string;
  /** Emplacement sur la grille de départ. */
  slot: number;
  car: CarState;
  /** Inputs reçus mais pas encore exécutés, du plus ancien au plus récent. */
  queue: PlayerInput[];
  /** Nombre d'inputs que ce joueur a encore le droit d'exécuter (anti-accélération). */
  budget: number;
  /** Dernier input EXÉCUTÉ : renvoyé dans les snapshots pour la réconciliation. */
  lastInputSeq: number;
  /** Dernier input REÇU (mis en file). Les numéros doivent strictement augmenter. */
  lastReceivedSeq: number;
}

const TICKS_PER_SNAPSHOT = SIM_TICK_RATE / SNAPSHOT_RATE;
const GRID_ROW_SPACING = 8; // mètres entre deux rangées
const GRID_LANE_OFFSET = 3.5; // mètres entre l'axe de la piste et chaque colonne

const MAX_QUEUED_INPUTS = 8; // au-delà, on jette les plus anciens
const MAX_INPUT_BUDGET = 6; // 6 pas de rattrapage maximum (100 ms)
const MAX_INPUTS_PER_TICK = 3; // un rattrapage ne dépasse jamais 3 pas à la fois

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
      queue: [],
      budget: MAX_INPUT_BUDGET,
      lastInputSeq: 0,
      lastReceivedSeq: 0,
    });
    this.start();
    return true;
  }

  /** Lecture seule de l'état d'un joueur (tests, et plus tard le système de course). */
  getPlayerState(id: string): { car: Readonly<CarState>; lastInputSeq: number } | undefined {
    const player = this.players.get(id);
    return player && { car: player.car, lastInputSeq: player.lastInputSeq };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    if (this.players.size === 0) this.stop();
  }

  /** Met un input DÉJÀ validé en file d'attente. Il sera exécuté à un prochain pas. */
  applyInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id);
    if (!player) return;
    // Doublon ou input rejoué : on l'ignore. Sinon lastInputSeq pourrait reculer et la
    // réconciliation du client rejouerait des inputs déjà comptés.
    if (input.seq <= player.lastReceivedSeq) return;
    player.lastReceivedSeq = input.seq;
    player.queue.push(input);
    // File trop longue : on garde les plus récents pour ne pas accumuler de retard.
    if (player.queue.length > MAX_QUEUED_INPUTS) player.queue.shift();
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

  /** Un pas de simulation. Appelée par la boucle ; publique pour les tests. */
  step(): void {
    for (const player of this.players.values()) {
      // Le budget se recharge d'un point par pas serveur, jusqu'au plafond.
      player.budget = Math.min(player.budget + 1, MAX_INPUT_BUDGET);

      // Un input = un pas de simulation de CETTE voiture. File vide : elle attend.
      let executed = 0;
      while (executed < MAX_INPUTS_PER_TICK && player.budget >= 1) {
        const input = player.queue.shift();
        if (!input) break;
        player.car = stepCarOnTrack(player.car, input, this.track);
        player.lastInputSeq = input.seq;
        player.budget -= 1;
        executed++;
      }
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
