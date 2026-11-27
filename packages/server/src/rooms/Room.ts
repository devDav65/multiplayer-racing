import {
  type CarState,
  COUNTDOWN_TICKS,
  createProgress,
  currentLap,
  FINISH_GRACE_TICKS,
  gridPosition,
  isCarFrozen,
  MAX_PLAYERS_PER_ROOM,
  type PlayerInput,
  RACE_LAPS,
  type RacePhase,
  type RaceProgress,
  RESULTS_TICKS,
  type ResultEntry,
  type RoomState,
  rankCars,
  SIM_DT,
  SIM_TICK_RATE,
  SNAPSHOT_RATE,
  type Snapshot,
  stepCarOnTrack,
  type Track,
  updateProgress,
} from "@racing/shared";
import type { RaceRecord } from "../races/RaceRepository";

interface Player {
  id: string;
  /** Petit numéro unique dans ce salon, utilisé dans les snapshots compacts. */
  netId: number;
  name: string;
  /** Compte connecté, ou null pour un invité. */
  userId: number | null;
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
  /** Arrivé pendant une course : bloqué et non classé jusqu'à la prochaine. */
  spectator: boolean;
  progress: RaceProgress;
}

export interface RoomOptions {
  code: string;
  track: Track;
  /** Nombre de tours (par défaut RACE_LAPS). */
  laps?: number;
  onSnapshot: (snapshot: Snapshot) => void;
  onRoomState: (state: RoomState) => void;
  /** Appelé à la fin de chaque course (enregistrement en base). */
  onRaceFinished?: (race: RaceRecord) => void;
}

const TICKS_PER_SNAPSHOT = SIM_TICK_RATE / SNAPSHOT_RATE;
const MAX_QUEUED_INPUTS = 8; // au-delà, on jette les plus anciens
const MAX_INPUT_BUDGET = 6; // 6 pas de rattrapage maximum (100 ms)
const MAX_INPUTS_PER_TICK = 3; // un rattrapage ne dépasse jamais 3 pas à la fois

/**
 * Un salon : ses joueurs, la boucle de simulation et les phases de la course.
 * Ne connaît PAS Socket.IO : la diffusion passe par les callbacks.
 *
 * Phases : lobby (conduite libre) → countdown (voitures bloquées sur la grille)
 * → racing (portes et tours comptés) → results (classement affiché) → lobby.
 */
export class Room {
  readonly code: string;
  private readonly track: Track;
  private readonly laps: number;
  private readonly onSnapshot: (snapshot: Snapshot) => void;
  private readonly onRoomState: (state: RoomState) => void;
  private readonly onRaceFinished: ((race: RaceRecord) => void) | undefined;
  /** Heure réelle du départ de la course en cours (pour l'historique). */
  private raceStartedAt: Date | null = null;
  private readonly players = new Map<string, Player>();
  private hostId: string | null = null;
  /** Prochain numéro réseau à attribuer (jamais réutilisé dans ce salon). */
  private nextNetId = 1;
  private phase: RacePhase = "lobby";
  /** Tick du début de la phase actuelle. */
  private phaseStartTick = 0;
  /** Tick d'arrivée du premier (lance le délai pour les autres), ou null. */
  private firstFinishTick: number | null = null;
  private results: ResultEntry[] | null = null;
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastTime = 0;
  private accumulator = 0;

  constructor(options: RoomOptions) {
    this.code = options.code;
    this.track = options.track;
    this.laps = options.laps ?? RACE_LAPS;
    this.onSnapshot = options.onSnapshot;
    this.onRoomState = options.onRoomState;
    this.onRaceFinished = options.onRaceFinished;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get currentPhase(): RacePhase {
    return this.phase;
  }

  /** Renvoie false si le salon est plein ou si le joueur y est déjà. */
  addPlayer(id: string, name: string, userId: number | null = null): boolean {
    if (this.players.has(id) || this.players.size >= MAX_PLAYERS_PER_ROOM) return false;

    // Premier emplacement de grille libre.
    const usedSlots = new Set([...this.players.values()].map((p) => p.slot));
    let slot = 0;
    while (usedSlots.has(slot)) slot++;

    this.players.set(id, {
      id,
      netId: this.nextNetId++,
      name,
      userId,
      slot,
      car: gridPosition(this.track, slot),
      queue: [],
      budget: MAX_INPUT_BUDGET,
      lastInputSeq: 0,
      lastReceivedSeq: 0,
      // Une course est en cours : il regardera et jouera à la suivante.
      spectator: this.phase === "countdown" || this.phase === "racing",
      progress: createProgress(),
    });
    this.hostId ??= id;
    this.start();
    this.emitRoomState();
    return true;
  }

  removePlayer(id: string): void {
    if (!this.players.delete(id)) return;
    // L'hôte part : le joueur arrivé le plus tôt devient hôte (une Map garde l'ordre d'ajout).
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    if (this.players.size === 0) {
      this.stop();
      return;
    }
    this.emitRoomState();
  }

  /** Lecture seule de l'état d'un joueur (tests). */
  getPlayerState(
    id: string,
  ):
    | { car: Readonly<CarState>; lastInputSeq: number; progress: RaceProgress; spectator: boolean }
    | undefined {
    const p = this.players.get(id);
    return (
      p && {
        car: p.car,
        lastInputSeq: p.lastInputSeq,
        progress: p.progress,
        spectator: p.spectator,
      }
    );
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

  /** L'hôte lance la course depuis le lobby. Renvoie false si la demande est refusée. */
  startRace(requesterId: string): boolean {
    if (requesterId !== this.hostId || this.phase !== "lobby") return false;
    // Grille compacte, dans l'ordre d'arrivée dans le salon.
    let slot = 0;
    for (const player of this.players.values()) {
      player.slot = slot++;
      player.car = gridPosition(this.track, player.slot);
      player.spectator = false;
      player.progress = createProgress();
    }
    this.firstFinishTick = null;
    this.results = null;
    this.setPhase("countdown");
    return true;
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
    const raceTick = this.tick - this.phaseStartTick;
    for (const player of this.players.values()) {
      // Le budget se recharge d'un point par pas serveur, jusqu'au plafond.
      player.budget = Math.min(player.budget + 1, MAX_INPUT_BUDGET);
      const frozen = isCarFrozen(this.phase, player.spectator);

      // Un input = un pas de simulation de CETTE voiture. File vide : elle attend.
      // Voiture bloquée : l'input est quand même consommé (lastInputSeq avance, ce qui
      // permet au client de vider sa liste d'inputs en attente), mais elle ne bouge pas.
      let executed = 0;
      while (executed < MAX_INPUTS_PER_TICK && player.budget >= 1) {
        const input = player.queue.shift();
        if (!input) break;
        if (!frozen) {
          const before = player.car;
          player.car = stepCarOnTrack(player.car, input, this.track);
          if (this.phase === "racing" && !player.spectator) {
            player.progress = updateProgress(
              player.progress,
              before,
              player.car,
              this.track,
              this.laps,
              raceTick,
            );
          }
        }
        player.lastInputSeq = input.seq;
        player.budget -= 1;
        executed++;
      }
    }

    this.tick++;
    this.advancePhase();
    if (this.tick % TICKS_PER_SNAPSHOT === 0) {
      this.onSnapshot(this.createSnapshot());
    }
  }

  /** Passe à la phase suivante quand c'est le moment. */
  private advancePhase(): void {
    const elapsed = this.tick - this.phaseStartTick;
    switch (this.phase) {
      case "lobby":
        return;
      case "countdown":
        if (elapsed >= COUNTDOWN_TICKS) {
          this.raceStartedAt = new Date();
          this.setPhase("racing");
        }
        return;
      case "racing": {
        const racers = this.racers();
        if (this.firstFinishTick === null && racers.some((p) => p.progress.finishTick !== null)) {
          this.firstFinishTick = this.tick;
        }
        const everyoneDone = racers.every((p) => p.progress.finishTick !== null);
        const graceOver =
          this.firstFinishTick !== null && this.tick - this.firstFinishTick >= FINISH_GRACE_TICKS;
        if (everyoneDone || graceOver) {
          this.results = this.computeResults();
          this.reportRace(this.results);
          this.setPhase("results");
        }
        return;
      }
      case "results":
        if (elapsed >= RESULTS_TICKS) {
          for (const player of this.players.values()) {
            player.spectator = false;
            player.progress = createProgress();
          }
          this.setPhase("lobby");
        }
        return;
    }
  }

  private setPhase(phase: RacePhase): void {
    this.phase = phase;
    this.phaseStartTick = this.tick;
    this.emitRoomState();
  }

  /** Joueurs qui participent à la course (pas les spectateurs). */
  private racers(): Player[] {
    return [...this.players.values()].filter((p) => !p.spectator);
  }

  private ranking(): string[] {
    return rankCars(
      this.racers().map((p) => ({ id: p.id, car: p.car, progress: p.progress })),
      this.track,
    );
  }

  /** Signale la course terminée (s'il y avait au moins un coureur). */
  private reportRace(results: ResultEntry[]): void {
    if (!this.onRaceFinished || results.length === 0 || !this.raceStartedAt) return;
    this.onRaceFinished({
      roomCode: this.code,
      trackId: this.track.id,
      laps: this.laps,
      startedAt: this.raceStartedAt,
      finishedAt: new Date(),
      results: results.map((r) => ({
        rank: r.rank,
        userId: this.players.get(r.id)?.userId ?? null,
        displayName: r.name,
        timeMs: r.timeMs,
      })),
    });
  }

  private computeResults(): ResultEntry[] {
    return this.ranking().map((id, index) => {
      const p = this.players.get(id);
      const finishTick = p?.progress.finishTick ?? null;
      return {
        id,
        name: p?.name ?? "?",
        rank: index + 1,
        timeMs: finishTick === null ? null : Math.round((finishTick * 1000) / SIM_TICK_RATE),
      };
    });
  }

  private ticksLeft(): number | null {
    const elapsed = this.tick - this.phaseStartTick;
    switch (this.phase) {
      case "countdown":
        return Math.max(0, COUNTDOWN_TICKS - elapsed);
      case "racing":
        return this.firstFinishTick === null
          ? null
          : Math.max(0, FINISH_GRACE_TICKS - (this.tick - this.firstFinishTick));
      case "results":
        return Math.max(0, RESULTS_TICKS - elapsed);
      default:
        return null;
    }
  }

  private createSnapshot(): Snapshot {
    const racing = this.phase === "racing" || this.phase === "results";
    const ranks = new Map(racing ? this.ranking().map((id, i) => [id, i + 1] as const) : []);
    return {
      tick: this.tick,
      serverTime: Date.now(),
      race: { phase: this.phase, ticksLeft: this.ticksLeft(), totalLaps: this.laps },
      cars: [...this.players.values()].map((p) => ({
        id: p.id,
        netId: p.netId,
        x: p.car.x,
        z: p.car.z,
        heading: p.car.heading,
        vx: p.car.vx,
        vz: p.car.vz,
        lastInputSeq: p.lastInputSeq,
        lap: currentLap(p.progress, this.laps),
        rank: ranks.get(p.id) ?? 0,
        finished: p.progress.finishTick !== null,
        spectator: p.spectator,
      })),
    };
  }

  getRoomState(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      totalLaps: this.laps,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        netId: p.netId,
        name: p.name,
        spectator: p.spectator,
      })),
      results: this.results,
    };
  }

  private emitRoomState(): void {
    this.onRoomState(this.getRoomState());
  }
}
