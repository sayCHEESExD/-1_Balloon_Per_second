import {
  MessageType,
  RARITIES,
  formatNumber,
  heldBalloon,
  visibleName,
  isBalloonOwned,
  petById,
  type PetHatchedMessage,
  type WinAwardedMessage,
} from '@highjump/shared';
import { AudioManager } from '../audio/AudioManager.js';
import { PlayerAudio } from '../audio/PlayerAudio.js';
import { Bloxity } from '../bloxity/Bloxity.js';
import { BloxityAvatar } from '../bloxity/BloxityAvatar.js';
import type { LegionEquipped, LegionProportions } from '../bloxity/legionTypes.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { clientConfig } from '../config/clientConfig.js';
import { InputManager } from '../input/InputManager.js';
import { NetworkClient } from '../net/NetworkClient.js';
import type { ConnectionStatus, NetPlayerState } from '../net/netTypes.js';
import { LocalPlayer } from '../player/LocalPlayer.js';
import { playerModelLoader } from '../player/PlayerModelLoader.js';
import { RemotePlayerManager } from '../player/RemotePlayerManager.js';
import { RunController } from '../progression/RunController.js';
import { RendererManager } from '../rendering/RendererManager.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { TrophyBurst } from '../rendering/TrophyBurst.js';
import { BalloonHud } from '../ui/BalloonHud.js';
import { BalloonPopups } from '../ui/BalloonPopups.js';
import { BalloonsPanel } from '../ui/BalloonsPanel.js';
import { BloxityPanel } from '../ui/BloxityPanel.js';
import { EggShopPanel } from '../ui/EggShopPanel.js';
import { HatchReveal } from '../ui/HatchReveal.js';
import { ICONS, injectHudStyles } from '../ui/hudStyles.js';
import { KeyHints, WinBanner } from '../ui/Overlays.js';
import { Panel, anyPanelOpen } from '../ui/Panel.js';
import { PetsPanel } from '../ui/PetsPanel.js';
import { RailButton } from '../ui/RailButton.js';
import { WinsCounter } from '../ui/WinsCounter.js';
import { logger } from '../util/logger.js';
import { CourseWorld } from '../world/CourseWorld.js';
import { Shopkeeper } from '../world/Shopkeeper.js';

const SCOPE = 'Game';

/**
 * Milliseconds after our own join during which a remote player counts as
 * already HERE rather than arriving - Bloxity's "friend is in this room" versus
 * "friend just joined" toasts.
 */
const IN_ROOM_WINDOW_MS = 3000;

/** `code` first, `key` as the fallback for keystrokes that carry no code. */
const shortcutOf = (event: KeyboardEvent): string => {
  const code = event.code;
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toLowerCase();
  if (code) return code.toLowerCase();
  return (event.key || '').toLowerCase();
};

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
};

/**
 * Composition root. Owns every subsystem and the per-frame order - input,
 * prediction, triggers, respawn, camera, network, render - and holds no
 * gameplay rules of its own.
 */
export class Game {
  private readonly renderer: RendererManager;
  private readonly sceneManager = new SceneManager();
  private readonly camera = new ThirdPersonCamera();
  private readonly input = new InputManager();
  private readonly world = new CourseWorld();
  private readonly remotePlayers: RemotePlayerManager;
  private readonly audio = new AudioManager();
  private readonly playerAudio: PlayerAudio;
  private readonly network: NetworkClient;
  private readonly run: RunController;
  /** The shopkeeper NPC. Built once the player model has loaded. */
  private shopkeeper: Shopkeeper | null = null;

  private readonly hud: BalloonHud;
  private readonly pops: BalloonPopups;
  private readonly wins: WinsCounter;
  /** Trophies popping around the local player when they collect a win. */
  private readonly trophyBurst = new TrophyBurst();
  private readonly banner: WinBanner;
  private readonly keys: KeyHints;
  private readonly rail: HTMLDivElement;

  private readonly balloonsPanel: BalloonsPanel;
  private readonly petsPanel: PetsPanel;
  private readonly eggPanel: EggShopPanel;
  private readonly hatchReveal: HatchReveal;
  private readonly panels: Panel[];

  private readonly balloonsButton: RailButton;
  private readonly petsButton: RailButton;
  private readonly audioButton: RailButton;

  private localPlayer: LocalPlayer | null = null;
  private localSessionId: string | null = null;
  private localState: NetPlayerState | null = null;
  private lastPurchases = '';
  private lastBalloons = -1;
  /** World 2's unlock as last seen, null before the first state. */
  private lastUnlocked: boolean | null = null;
  /** A zone's menu was closed by hand while standing in it; do not reopen until they leave. */
  private shopDismissed = false;
  private eggDismissed = false;

  /** The Bloxity bridge. The only thing in the client that talks to the SDK. */
  private readonly bloxity: Bloxity;
  private readonly bloxityPanel: BloxityPanel;
  /** Bloxity cosmetics on the local character. Built once the model exists. */
  private bloxityAvatar: BloxityAvatar | null = null;
  /** The latest look, held until the character is built. */
  private pendingLook: { equipped: LegionEquipped; proportions: LegionProportions } | null = null;
  /** Whether a Bloxity account is signed in, held until the character is built. */
  private signedIn = false;
  /** Remote players already announced to Bloxity, so a name is toasted once. */
  private readonly announced = new Set<string>();
  private joinedAt = 0;
  private identityTimer = 0;
  private avatarTimer = 0;
  /** FPS readout for the portal's `show_fps` setting. */
  private readonly fpsReadout: HTMLDivElement;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(container: HTMLElement) {
    injectHudStyles();
    this.renderer = new RendererManager(container);
    this.remotePlayers = new RemotePlayerManager(this.sceneManager.scene);
    this.playerAudio = new PlayerAudio(this.audio);

    this.hud = new BalloonHud(container);
    this.pops = new BalloonPopups(container);
    this.wins = new WinsCounter(container);
    this.banner = new WinBanner(container);
    this.keys = new KeyHints(container);

    this.network = new NetworkClient({
      onStatusChange: (status) => this.onStatusChange(status),
      onSelfJoined: (sessionId) => {
        this.localSessionId = sessionId;
        this.joinedAt = performance.now();
        // Published as soon as the room is joinable, so an invite lands the
        // friend in THIS room rather than merely in the game.
        const roomId = this.network.roomId;
        this.bloxity.updateRoom(roomId);
        this.bloxityPanel.setRoom(roomId);
        // Now there is a room to tell which avatar we wear.
        this.publishAvatar();
      },
      onPlayerAdded: (sessionId, state) => this.onPlayerState(sessionId, state, true),
      onPlayerChanged: (sessionId, state) => this.onPlayerState(sessionId, state, false),
      onPlayerRemoved: (sessionId) => {
        this.announced.delete(sessionId);
        this.remotePlayers.remove(sessionId);
      },
      // Placed at spawn immediately. Every placement starts a new attempt, so
      // every win pad can pay once again.
      onRespawn: (message) => {
        this.localPlayer?.teleport(message.x, message.y, message.z, message.rotationY);
        this.run.startAttempt();
      },
      onWinAwarded: (message) => this.onWinAwarded(message),
      onPetHatched: (message) => this.onPetHatched(message),
    });

    this.fpsReadout = document.createElement('div');
    this.fpsReadout.className = 'hj-fps hj-font';
    this.fpsReadout.hidden = true;
    container.appendChild(this.fpsReadout);

    /*
     * The Bloxity bridge. Everything Bloxity can change about the game arrives
     * through these callbacks, and nothing else in the codebase imports the SDK.
     */
    this.bloxity = new Bloxity({
      setMasterVolume: (level) => this.audio.setMasterVolume(level),
      setMusicVolume: (level) => this.audio.setMusicVolume(level),
      setGraphicsQuality: (level) => this.renderer.setQuality(level),
      setShowFps: (show) => {
        this.fpsReadout.hidden = !show;
      },
      setCameraSensitivity: (scale) => this.input.look.setSensitivityScale(scale),
      // The portal asks; the SERVER still decides where anyone is placed.
      respawn: () => this.network.requestRespawn(),
      pointerLockChanged: (locked) => this.input.look.setCursorFree(!locked),
      avatarChanged: (equipped, proportions) => {
        if (this.bloxityAvatar) this.bloxityAvatar.apply(equipped, proportions);
        else this.pendingLook = { equipped, proportions };
        this.bloxityPanel.refreshAvatar();
        // A new look is a new avatar thumbnail: the server re-reads the profile.
        this.refreshIdentitySoon();
        // ...and a new look for everyone ELSE to render.
        this.publishAvatar();
      },
      // A login or logout after joining. Before joining this is a no-op and the
      // join itself carries the token.
      identityChanged: (user, token) => {
        // A signed-in account wears Bloxity's own body, default avatar included.
        this.signedIn = user !== null;
        this.bloxityAvatar?.setSignedIn(this.signedIn);
        this.network.sendIdentity(token);
        this.publishAvatar();
      },
    });
    this.network.setIdentityProvider(() => this.bloxity.getToken());
    this.bloxityPanel = new BloxityPanel(container, this.bloxity);

    this.balloonsPanel = new BalloonsPanel(container, {
      buy: (slot) => this.network.sendSlot(MessageType.BuyBalloon, slot),
      equip: (slot) => this.network.sendSlot(MessageType.EquipBalloon, slot),
    });
    this.balloonsPanel.onClose(() => {
      if (this.run.atShop) this.shopDismissed = true;
    });
    this.petsPanel = new PetsPanel(container, {
      equipBest: () => this.network.sendEmpty(MessageType.EquipBestPets),
      toggle: (index) => this.network.sendIndex(MessageType.TogglePet, index),
      remove: (index) => this.network.sendIndex(MessageType.DeletePet, index),
    });
    this.eggPanel = new EggShopPanel(container, (slot) => {
      this.flushInput();
      this.network.sendSlot(MessageType.HatchEgg, slot);
    });
    this.eggPanel.onClose(() => {
      if (this.run.currentEgg > 0) this.eggDismissed = true;
    });
    this.hatchReveal = new HatchReveal(container, {
      crack: () => this.audio.play('crack'),
      reveal: () => this.audio.play('hatch'),
    });
    this.panels = [this.balloonsPanel, this.petsPanel, this.eggPanel];

    this.rail = document.createElement('div');
    this.rail.className = 'hj-rail';
    container.appendChild(this.rail);
    const tile = (variant: string, label: string, icon: string, hotkey: string, onClick: () => void): RailButton =>
      new RailButton(this.rail, { variant, label, icon, hotkey, onClick });
    this.balloonsButton = tile('balloons', 'BALLOONS', ICONS.balloon, 'B', () => this.openOnly(this.balloonsPanel));
    this.petsButton = tile('pets', 'PETS', ICONS.pets, 'P', () => this.openOnly(this.petsPanel));
    this.audioButton = tile('audio', 'SOUND', ICONS.audio, 'M', () => {
      const muted = this.audio.toggleMuted();
      this.audioButton.root.classList.toggle('hj-tile--off', muted);
      if (!muted) this.audio.play('ui');
    });
    this.audioButton.root.classList.toggle('hj-tile--off', this.audio.isMuted);

    this.run = new RunController(this.world.collision, {
      claimWin: (area) => {
        // The server validates against the last position it SIMULATED.
        this.flushInput();
        this.network.claimWin(area);
      },
      fell: () => {
        this.audio.play('fall');
        this.flushInput();
      },
      eggChanged: (slot) => {
        if (slot === 0) {
          this.eggDismissed = false;
          this.eggPanel.setOpen(false);
          return;
        }
        if (this.eggDismissed || (anyPanelOpen() && !this.eggPanel.isOpen)) return;
        this.eggPanel.openFor(slot);
        this.audio.play('ui');
      },
      shopChanged: (inside) => {
        if (!inside) {
          this.shopDismissed = false;
          this.balloonsPanel.setOpen(false);
          return;
        }
        if (this.shopDismissed || anyPanelOpen()) return;
        this.balloonsPanel.setOpen(true);
        this.audio.play('ui');
      },
      portalChanged: (target) => {
        if (target !== 2 || this.localState?.world2Unlocked) return;
        this.audio.play('deny');
        this.banner.show('REACH THE FINAL STEP OF WORLD 1 TO UNLOCK WORLD 2', '#9fd8ff');
      },
    });

    window.addEventListener('keydown', this.onHotkey);
    window.addEventListener('keydown', this.onGesture);
    window.addEventListener('mousedown', this.onGesture);
    window.addEventListener('touchstart', this.onGesture, { passive: true });
    this.renderer.onResize((width, height) => this.camera.setViewport(width, height));
    this.renderer.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /**
   * Mouse-wheel zoom: up zooms in, down zooms out. Bound to the canvas, so a
   * wheel over a scrolling panel scrolls the panel instead.
   */
  private readonly onWheel = (event: WheelEvent): void => {
    if (anyPanelOpen()) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    this.camera.addZoom(event.deltaY * scale);
  };

  async initialise(): Promise<void> {
    this.sceneManager.scene.add(this.world.root, this.trophyBurst.root);
    await playerModelLoader.load();
    this.shopkeeper = new Shopkeeper();
    this.sceneManager.scene.add(this.shopkeeper.root);
    this.localPlayer = new LocalPlayer(this.world.collision);
    this.localPlayer.character.setNameTag('You', 0);
    this.sceneManager.scene.add(this.localPlayer.character.root, this.localPlayer.character.worldRoot);
    // Bloxity cosmetics on the LOCAL character, with any look that arrived while
    // the model was still loading.
    // Built AFTER the bundled character, so nothing can overwrite the Bloxity look.
    this.bloxityAvatar = new BloxityAvatar(this.localPlayer.character, this.signedIn);
    if (this.pendingLook) {
      this.bloxityAvatar.apply(this.pendingLook.equipped, this.pendingLook.proportions);
      this.pendingLook = null;
    }
    this.camera.snapTo(this.localPlayer.position);
    logger.info(SCOPE, 'world ready');
  }

  async connect(): Promise<void> {
    await this.network.connect();
  }

  /** Initialise Bloxity. Called before anything loads, so the portal's loading screen is listening. */
  startBloxity(): void {
    this.bloxity.start();
  }

  /** Progress, for the portal's loading screen. */
  loadingStep(text: string): void {
    this.bloxity.loadingStep(text);
  }

  start(): void {
    this.input.attach(this.renderer.renderer.domElement);
    // The loading screen comes down and the session begins.
    this.bloxity.loadingEnd();
    this.bloxity.gameplayStart();
  }

  update(delta: number): void {
    this.fpsFrames += 1;
    this.fpsTime += delta;
    if (this.fpsTime >= 0.5) {
      if (!this.fpsReadout.hidden) this.fpsReadout.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.input.setSuppressed(anyPanelOpen() || this.hatchReveal.isShowing);
    const input = this.input.sample();
    const player = this.localPlayer;
    this.camera.setOrbit(this.input.look.yaw, this.input.look.pitch);

    if (player) {
      player.update(delta, input, this.input.look.yaw);
      this.run.update(delta, player);

      if (player.consumeRespawnNudge()) this.network.requestRespawn();

      const placement = player.consumePlacement();
      if (placement !== 'none') this.camera.snapTo(player.position, placement === 'respawn');
      this.camera.setTarget(player.position);
      this.sceneManager.followShadow(player.position.x, player.position.y, player.position.z);
      this.flushInput();
      this.playerAudio.update(delta, player);

      const state = this.localState;
      if (state) {
        this.hud.update(delta, state.balloons, state.balloonsPerTick, state.lift, state.ownedBalloons, state.world);
        this.eggPanel.sync(state.wins, state.pets, this.run.currentEgg);
      }
    }

    this.world.scoreboard.update(this.network.leaderboard);
    this.trophyBurst.update(delta, this.localPlayer?.position ?? null);
    this.shopkeeper?.update(delta, this.localPlayer?.position ?? null);
    this.remotePlayers.advance(delta);
    this.camera.update(delta, player?.horizontalSpeed ?? 0);
    const eye = this.camera.camera.position;
    this.world.update(delta, eye.x, eye.y, eye.z);
    this.renderer.renderer.render(this.sceneManager.scene, this.camera.camera);
  }

  private readonly onHotkey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTyping(event.target)) return;
    switch (shortcutOf(event)) {
      case 'b':
        this.balloonsButton.press();
        break;
      case 'p':
        this.petsButton.press();
        break;
      case 'm':
        this.audioButton.press();
        break;
      case 'escape':
        for (const panel of this.panels) panel.setOpen(false);
        this.hatchReveal.hide();
        this.bloxityPanel.closeAll();
        this.input.look.setCursorFree(true);
        // Embedded, the portal owns the pause menu; standalone there is none.
        if (this.bloxity.embedded) this.bloxity.showPortalMenu(true);
        break;
      default:
        break;
    }
  };

  private readonly onGesture = (): void => {
    this.audio.resume();
  };

  private openOnly(panel: Panel): void {
    for (const other of this.panels) if (other !== panel) other.setOpen(false);
    this.bloxityPanel.closeAll();
    panel.toggle();
    this.audio.play('ui');
  }

  /**
   * Tell the room which Bloxity avatar we wear, so every OTHER player renders this
   * character as Bloxity has it.
   *
   * The account's own SDK is the only place these equipped ids can be read - Bloxity's
   * avatar route refuses the game-scoped token the server holds - so this is the one
   * thing the client reports about itself. A guest reports none and stays in the
   * bundled body. Debounced, because the customizer fires a change per edit.
   */
  private publishAvatar(): void {
    window.clearTimeout(this.avatarTimer);
    this.avatarTimer = window.setTimeout(() => {
      const equipped = this.signedIn ? (this.bloxity.getEquipped() as Record<string, string>) : null;
      this.network.sendAvatar(equipped);
      logger.info(SCOPE, `published our Bloxity avatar: ${equipped ? JSON.stringify(equipped) : 'none'}`);
    }, 350);
  }

  /**
   * Ask the server to re-verify our Bloxity token, so every player sees our current
   * name and avatar thumbnail. Debounced: the customizer fires a change per edit.
   */
  private refreshIdentitySoon(): void {
    window.clearTimeout(this.identityTimer);
    this.identityTimer = window.setTimeout(() => {
      const token = this.bloxity.getToken();
      if (token) this.network.sendIdentity(token);
    }, 2000);
  }

  private flushInput(): void {
    const player = this.localPlayer;
    if (!player) return;
    for (const message of player.drainOutgoing()) this.network.sendInput(message);
  }

  private onPlayerState(sessionId: string, state: NetPlayerState, added: boolean): void {
    if (sessionId === this.localSessionId) {
      this.applyLocalState(state);
      return;
    }
    if (added) this.remotePlayers.add(sessionId, state);
    else this.remotePlayers.update(sessionId, state);
    // A verified name arrives a moment after the player does.
    this.announce(sessionId, state);
  }

  /**
   * Tell Bloxity who is here, once per player, by their Bloxity name. Only
   * names the SERVER verified are announced.
   */
  private announce(sessionId: string, state: NetPlayerState): void {
    if (!state.displayName || this.announced.has(sessionId)) return;
    this.announced.add(sessionId);
    if (performance.now() - this.joinedAt < IN_ROOM_WINDOW_MS) this.bloxity.playerInRoom(state.displayName);
    else this.bloxity.playerJoined(state.displayName);
  }

  /** Everything the server says about us. Rendered, reconciled, never derived. */
  private applyLocalState(state: NetPlayerState): void {
    const player = this.localPlayer;
    if (!player) return;
    this.localState = state;

    player.setLift(state.lift);
    const held = heldBalloon(state.equippedBalloon, state.ownedBalloons);
    player.character.setBalloon(held.slot);
    // A giant balloon needs the camera further back to fit in shot.
    this.camera.setSubjectScale(held.size);
    player.character.setPets(state.pets);
    player.character.setNameTag(visibleName(state.displayName), state.balloons, state.displayName ? state.avatarUrl : '');
    if (state.ready) {
      player.reconcile({
        x: state.x,
        y: state.y,
        z: state.z,
        rotationY: state.rotationY,
        velocityX: state.velocityX,
        velocityY: state.velocityY,
        velocityZ: state.velocityZ,
        grounded: state.grounded,
        jumpCount: state.jumpCount,
        lastInputSeq: state.lastInputSeq,
        jumpLatched: state.jumpLatched,
        coyote: state.coyote,
        airGravity: state.airGravity,
        airTerminal: state.airTerminal,
      });
    }

    // World 2: the portal opens, announced once when it is earned (not on join).
    this.world.setWorld2Unlocked(state.world2Unlocked);
    if (this.lastUnlocked === false && state.world2Unlocked) {
      this.audio.play('win');
      this.banner.show('WORLD 2 UNLOCKED!', '#7fd4ff');
    }
    this.lastUnlocked = state.world2Unlocked;

    this.hud.observe(state.balloons);
    this.pops.observe(state.balloons);
    if (this.lastBalloons >= 0 && state.balloons > this.lastBalloons) this.audio.play('balloon');
    this.lastBalloons = state.balloons;
    this.wins.update(state.wins);

    const purchases = `${state.ownedBalloons}|${state.pets.length}`;
    if (this.lastPurchases && purchases !== this.lastPurchases && isBalloonOwned(state.ownedBalloons, state.equippedBalloon)) {
      this.audio.play('buy');
    }
    this.lastPurchases = purchases;

    this.balloonsPanel.setInventory(state.ownedBalloons, state.equippedBalloon, state.wins);
    this.balloonsButton.setState(this.balloonsPanel.hasAffordable);
    this.petsPanel.setInventory(state.pets);
  }

  private onWinAwarded(message: WinAwardedMessage): void {
    this.wins.update(message.total);
    this.audio.play('win');
    this.banner.show(`+${formatNumber(message.wins)} WINS!`);
    this.trophyBurst.play();
  }

  private onPetHatched(message: PetHatchedMessage): void {
    const pet = petById(message.pet);
    if (!pet) return;
    this.eggPanel.setOpen(false);
    this.hatchReveal.show(message.egg, pet.id);
    window.setTimeout(() => this.banner.show(`${pet.rarity.toUpperCase()} ${pet.name.toUpperCase()}!`, RARITIES[pet.rarity].color), 1100);
  }

  private onStatusChange(status: ConnectionStatus): void {
    if (clientConfig.debug) logger.info(SCOPE, `connection: ${status}`);
  }

  dispose(): void {
    this.bloxity.gameplayEnd();
    // Out of the room, so a friend is not invited into a game nobody is in.
    this.bloxity.updateRoom('');
    this.input.detach();
    void this.network.disconnect();
    this.renderer.renderer.domElement.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onHotkey);
    window.removeEventListener('keydown', this.onGesture);
    window.removeEventListener('mousedown', this.onGesture);
    window.removeEventListener('touchstart', this.onGesture);
    for (const panel of this.panels) panel.dispose();
    for (const button of [this.balloonsButton, this.petsButton, this.audioButton]) button.dispose();
    this.hatchReveal.dispose();
    this.hud.dispose();
    this.pops.dispose();
    this.wins.dispose();
    this.trophyBurst.dispose();
    this.banner.dispose();
    this.keys.dispose();
    this.rail.remove();
    this.audio.dispose();
    this.remotePlayers.dispose();
    this.shopkeeper?.dispose();
    this.bloxityPanel.dispose();
    this.bloxityAvatar?.dispose();
    this.bloxity.dispose();
    this.fpsReadout.remove();
    this.world.dispose();
    this.renderer.dispose();
  }
}
