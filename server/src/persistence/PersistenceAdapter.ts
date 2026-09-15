/**
 * Everything worth keeping about a player between sessions.
 *
 * The DERIVING facts only: the reach and the balloon payout are recomputed
 * from these on load through the same formulas a live session uses, so a
 * tuning change reaches returning players.
 */
export interface StoredProfile {
  balloons: number;
  wins: number;
  playSeconds: number;
  ownedBalloons: number;
  equippedBalloon: number;
  pets: string;
  /** World 2 unlocked (World 1's final step reached). */
  world2Unlocked?: boolean;
  updatedAt: number;
}

/**
 * Where profiles live. `createPersistence` is the ONLY place naming a concrete
 * adapter; nothing above this boundary knows it is a JSON file.
 */
export interface PersistenceAdapter {
  load(): Map<string, StoredProfile>;
  save(profiles: Map<string, StoredProfile>): void;
  flush(): void;
}
