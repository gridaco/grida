import { describe, expect, it } from "vitest";
import { SettingsNavigation } from "./settings-navigation";

describe("SettingsNavigation", () => {
  it.each(["#provider-elevenlabs", "#provider-tripo"])(
    "opens media providers for existing setup link %s",
    (hash) => expect(SettingsNavigation.fromHash(hash)).toBe("media")
  );
  it.each(SettingsNavigation.sections)(
    "opens the $label category",
    ({ id }) => {
      expect(SettingsNavigation.fromHash(`#${id}`)).toBe(id);
    }
  );
  it("uses Account for a missing or unknown category", () => {
    expect(SettingsNavigation.fromHash("")).toBe("account");
    expect(SettingsNavigation.fromHash("#unknown")).toBe("account");
  });
});
