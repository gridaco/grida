export type InventoryLevelCommit = {
  diff: number;
};

export interface MutableInventoryStock {
  available: number;
  on_hand: number;
}

export interface InventoryStock extends MutableInventoryStock {
  available: number;
  committed: number;
  unavailable: number;
  on_hand: number;
  incoming: number;
}
