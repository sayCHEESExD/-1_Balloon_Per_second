import { Client, Room, ServerError } from '@colyseus/core';
import {
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  SPAWN_ROTATION_Y,
  isFinalStep,
  portalAt,
  worldAtX,
  worldSpawn,
  type BloxityIdentityMessage,
  type ClaimWinMessage,
  type IndexMessage,
  type MoveMessage,
  type PetHatchedMessage,
  type RespawnMessage,
  type RespawnReason,
  type SlotMessage,
  type WinAwardedMessage,
} from '@highjump/shared';
import { verifyBloxityToken } from '../bloxity/bloxityIdentity.js';
import { buxGrants } from '../bloxity/buxGrantsStore.js';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService } from '../movement/MovementService.js';
import { BalloonService } from '../progression/BalloonService.js';
import { BalloonShopService } from '../progression/BalloonShopService.js';
import { leaderboardService } from '../progression/LeaderboardService.js';
import { PetService } from '../progression/PetService.js';
import { profileStore } from '../progression/ProfileStore.js';
import { wallet } from '../progression/Wallet.js';
import { WinService } from '../progression/WinService.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

/** Seconds between autosaves of every connected player. */
const AUTOSAVE_SECONDS = 15;

/** Milliseconds between two shop/menu requests from one player. */
const REQUEST_COOLDOWN_MS = 150;

interface JoinOptions {
  playerId?: string;
  /** A Bloxity token, verified by the server with Bloxity. Never an id. */
  bloxityToken?: string;
}

/**
 * The authoritative room.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. The one hard rule: nothing a client sends is ever copied into
 * state. A Move is simulated, a claim is validated, a purchase is checked, and
 * each produces a result the server writes itself.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;

  /**
   * An empty room CLOSES ITSELF. Written out even though it is the Colyseus
   * default, because it is a requirement of this game.
   */
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly balloons = new BalloonService();
  private readonly winService = new WinService();
  private readonly shop = new BalloonShopService();
  private readonly pets = new PetService();

  private readonly playerIds = new Map<string, string>();
  private readonly lastRequest = new Map<string, number>();
  private autosaveTimer = 0;

  /**
   * VERIFIED Bloxity account id per session, for Bux fulfilment. Only ever
   * written from a token Bloxity itself resolved, so a grant can only reach the
   * account that paid for it.
   */
  private readonly bloxityIds = new Map<string, string>();
  /** Latest identity check per session, so a stale verification cannot win a race. */
  private readonly identityChecks = new Map<string, number>();

  override onCreate(): void {
    this.setState(new GameState());
    this.setPatchRate(serverConfig.patchRateMs);

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => this.onMove(client, message));
    this.onMessage(MessageType.RequestRespawn, (client) => this.respawn(client, 'manual'));
    this.onMessage(MessageType.ClaimWin, (client, message: ClaimWinMessage) => this.onClaimWin(client, message));
    this.onMessage(MessageType.BuyBalloon, (client, message: SlotMessage) =>
      this.request(client, (player) => {
        if (this.shop.buy(player, Number(message?.slot), this.balloons) === null) {
          logger.info(SCOPE, `${client.sessionId} bought balloon ${message.slot}`);
        }
      }),
    );
    this.onMessage(MessageType.EquipBalloon, (client, message: SlotMessage) =>
      this.request(client, (player) => this.shop.equip(player, Number(message?.slot), this.balloons)),
    );
    this.onMessage(MessageType.HatchEgg, (client, message: SlotMessage) =>
      this.request(client, (player) => {
        const result = this.pets.hatch(player, Number(message?.slot), this.balloons);
        if (!result.pet) return;
        const payload: PetHatchedMessage = { egg: Math.floor(Number(message.slot)), pet: result.pet.id };
        client.send(MessageType.PetHatched, payload);
        logger.info(SCOPE, `${client.sessionId} hatched ${result.pet.id} from egg ${payload.egg}`);
      }),
    );
    this.onMessage(MessageType.TogglePet, (client, message: IndexMessage) =>
      this.request(client, (player) => this.pets.toggle(player, Number(message?.index), this.balloons)),
    );
    this.onMessage(MessageType.EquipBestPets, (client) =>
      this.request(client, (player) => this.pets.equipBest(player, this.balloons)),
    );
    this.onMessage(MessageType.DeletePet, (client, message: IndexMessage) =>
      this.request(client, (player) => this.pets.remove(player, Number(message?.index), this.balloons)),
    );

    this.onMessage(MessageType.BloxityIdentity, (client, message: BloxityIdentityMessage) =>
      this.resolveIdentity(client.sessionId, typeof message?.token === 'string' ? message.token : ''),
    );

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM})`);
  }

  /** Capacity re-checked at the door, independent of the matchmaker's reservation. */
  override onAuth(): boolean {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      throw new ServerError(4103, 'room is full');
    }
    return true;
  }

  override onJoin(client: Client, options: JoinOptions = {}): void {
    const player = new PlayerState();
    player.sessionId = client.sessionId;

    const playerId = typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';
    if (playerId) this.playerIds.set(client.sessionId, playerId);

    // Restore BEFORE deriving: the reach and the payout follow from it.
    const restored = playerId ? profileStore.restore(playerId, player) : false;

    this.state.players.set(client.sessionId, player);
    this.movement.initialise(player);
    this.balloons.initialise(player);
    this.placeAt(client, player, 'join');

    // In the background: a join must not wait on a round trip to Bloxity.
    if (typeof options.bloxityToken === 'string' && options.bloxityToken) {
      this.resolveIdentity(client.sessionId, options.bloxityToken);
    }

    logger.info(
      SCOPE,
      `join ${client.sessionId} (${restored ? 'restored' : 'new'}) balloons=${player.balloons} ` +
        `wins=${player.wins} (${this.clients.length}/${MAX_PLAYERS_PER_ROOM})`,
    );
  }

  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    this.persist(client.sessionId, player);
    this.state.players.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.balloons.forget(client.sessionId);
    this.winService.forget(client.sessionId);
    this.playerIds.delete(client.sessionId);
    this.lastRequest.delete(client.sessionId);
    this.bloxityIds.delete(client.sessionId);
    this.identityChecks.delete(client.sessionId);
    logger.info(SCOPE, `leave ${client.sessionId} (${this.clients.length} left)`);
  }

  override onDispose(): void {
    for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    logger.info(SCOPE, `room ${this.roomId} disposed (empty)`);
  }

  /** Simulate an input. Movement pays nothing: balloons come from time. */
  private onMove(client: Client, message: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.movement.applyInput(client.sessionId, player, message);
  }

  private onClaimWin(client: Client, message: ClaimWinMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const result = this.winService.claim(player, Number(message?.area), Date.now());
    if (!result.granted) {
      if (result.reason !== 'cooldown' && result.reason !== 'already-claimed') {
        logger.warn(
          SCOPE,
          `win claim ${message?.area} refused for ${client.sessionId} (${result.reason}) at ` +
            `(${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`,
        );
      }
      return;
    }

    // Checked BEFORE the placement below: the final step's pad sends the player home.
    this.checkWorld2Unlock(client.sessionId, player);
    const payload: WinAwardedMessage = { area: Math.floor(Number(message.area)), wins: result.wins, total: player.wins };
    client.send(MessageType.WinAwarded, payload);
    // Banking a win ends the attempt. No checkpoints: straight back to spawn.
    this.placeAt(client, player, 'win');
    this.persist(client.sessionId, player);
    logger.info(SCOPE, `win area ${payload.area} banked by ${client.sessionId} (+${result.wins})`);
  }

  /** Rate-limited wrapper for every menu and shop request. */
  private request(client: Client, action: (player: PlayerState) => unknown): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const now = Date.now();
    if (now - (this.lastRequest.get(client.sessionId) ?? 0) < REQUEST_COOLDOWN_MS) return;
    this.lastRequest.set(client.sessionId, now);
    action(player);
    this.persist(client.sessionId, player);
  }

  private tick(delta: number): void {
    leaderboardService.update(delta, this.state.leaderboard, this.state.players, this.playerIds);

    for (const [sessionId, player] of this.state.players) {
      player.playSeconds += delta;
      if (!player.ready) continue;
      this.balloons.tick(player, delta);
      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (!client) continue;
      // Off the side of the staircase and into the sky: back to this world's spawn.
      if (this.movement.collision.hasFallen(player.y, player.z)) {
        this.respawn(client, 'fall');
        continue;
      }
      this.checkWorld2Unlock(sessionId, player);
      // Walking into a portal. World 1's stays shut until World 2 is unlocked.
      const portal = portalAt(player.x, player.y, player.z);
      if (portal && portal.world === player.world && (portal.target === 1 || player.world2Unlocked)) {
        this.placeAt(client, player, 'portal', portal.target);
        this.persist(sessionId, player);
      }
    }

    // Bux bought by someone already in the room. One boolean in the common case.
    if (buxGrants.hasPending) {
      for (const [sessionId, player] of this.state.players) this.applyGrants(sessionId, player);
    }

    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const [sessionId, player] of this.state.players) this.persist(sessionId, player);
    }
  }

  /**
   * Resolve a Bloxity token to an account, then hand over anything it bought.
   *
   * An empty token is a logout. Every call supersedes the one before it, so a
   * slow verification of an old token can never overwrite a newer answer.
   */
  private resolveIdentity(sessionId: string, token: string): void {
    const check = (this.identityChecks.get(sessionId) ?? 0) + 1;
    this.identityChecks.set(sessionId, check);

    if (!token) {
      this.bloxityIds.delete(sessionId);
      const player = this.state.players.get(sessionId);
      if (player) {
        player.displayName = '';
        player.avatarUrl = '';
      }
      return;
    }

    void verifyBloxityToken(token, serverConfig.bloxityApiBase, serverConfig.bloxityGameId).then((user) => {
      if (this.identityChecks.get(sessionId) !== check) return;
      const player = this.state.players.get(sessionId);
      if (!player) return;
      if (!user) {
        this.bloxityIds.delete(sessionId);
        player.displayName = '';
        player.avatarUrl = '';
        return;
      }
      this.bloxityIds.set(sessionId, user.id);
      // What every client shows for this player: Bloxity's own profile, never an id.
      player.displayName = user.displayName || user.username;
      player.avatarUrl = user.avatarUrl;
      // Saved, so the boards keep the name and avatar while the player is offline.
      this.persist(sessionId, player);
      logger.info(SCOPE, `${sessionId} verified as Bloxity @${user.username}`);
      this.applyGrants(sessionId, player);
    });
  }

  /**
   * Hand over purchases waiting for this player's verified account. Through
   * `wallet.add` like every other award, and saved immediately.
   */
  private applyGrants(sessionId: string, player: PlayerState): void {
    const bloxityId = this.bloxityIds.get(sessionId);
    if (!bloxityId) return;
    const grants = buxGrants.drain(bloxityId);
    if (grants.length === 0) return;
    for (const grant of grants) {
      wallet.add(player, grant.wins);
      logger.info(SCOPE, `granted ${grant.sku} to ${sessionId} (+${grant.wins} wins) [${grant.transactionId}]`);
    }
    this.persist(sessionId, player);
  }

  private respawn(client: Client, reason: RespawnReason): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.placeAt(client, player, reason);
  }

  /** Standing on World 1's final step unlocks World 2, for good. */
  private checkWorld2Unlock(sessionId: string, player: PlayerState): void {
    if (player.world2Unlocked || player.world !== 1 || !player.grounded) return;
    if (worldAtX(player.x) !== 1 || !isFinalStep(player.y, player.z)) return;
    player.world2Unlocked = true;
    this.persist(sessionId, player);
    logger.info(SCOPE, `${sessionId} unlocked World 2`);
  }

  /**
   * THE one way a player is placed, and there is exactly ONE destination per
   * world: that world's spawn. This takes no position for that reason - a
   * placement that could land elsewhere is a checkpoint system waiting to be
   * reintroduced. Every placement starts a fresh attempt, so each win pad can pay
   * again once. Only a placement changes the player's world, and with it the
   * world's climb (`BalloonService.syncDerived`).
   */
  private placeAt(client: Client, player: PlayerState, reason: RespawnReason, world = player.world): void {
    const from = `(${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`;
    const target = world === 2 && player.world2Unlocked ? 2 : 1;
    if (player.world !== target) {
      player.world = target;
      this.balloons.syncDerived(player);
    }
    const spawn = worldSpawn(target);
    this.movement.teleport(client.sessionId, player, spawn.x, spawn.y, spawn.z, SPAWN_ROTATION_Y);
    this.winService.startAttempt(client.sessionId);

    const message: RespawnMessage = {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      rotationY: SPAWN_ROTATION_Y,
      reason,
    };
    client.send(MessageType.Respawn, message);
    if (reason !== 'join') logger.info(SCOPE, `place ${client.sessionId} ${from} -> world ${target} spawn (${reason})`);
  }

  private persist(sessionId: string, player: PlayerState | undefined): void {
    const playerId = this.playerIds.get(sessionId);
    if (player && playerId) profileStore.save(playerId, player);
  }
}
