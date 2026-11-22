import seed from "./model-catalogue.generated.json";
import type { ModelCatalogueSnapshot } from "./public-models.mjs";

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

const snapshot: ModelCatalogueSnapshot = freeze(seed);
export function bundledModelCatalogue(): ModelCatalogueSnapshot {
  return snapshot;
}
