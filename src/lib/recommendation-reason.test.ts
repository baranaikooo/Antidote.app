import { expect, it } from "vitest";
import { recommendationReason } from "./recommendation-reason";

it("describes the shared highest priority before considering the radius", () => {
  expect(recommendationReason("sloboda", "sloboda", 25, 12)).toBe(
    "Obaja ste v dotazníku dali najvyššiu prioritu slobode.",
  );
});

it("describes the verified distance filter when the priorities differ", () => {
  expect(recommendationReason("rodina", "sloboda", 25, 12)).toBe(
    "Ste od seba približne 12 km. Nastavený dosah je 25 km.",
  );
  expect(recommendationReason(undefined, null, 25, 0)).toMatch(/menej ako 1 km/);
});

it("does not invent a reason when the location or a recognized shared priority is unavailable", () => {
  expect(recommendationReason("rodina", "sloboda", 500, 12)).toBeNull();
  expect(recommendationReason("rodina", "sloboda", 25, undefined)).toBeNull();
  expect(recommendationReason("legacy", "legacy", 25, 26)).toBeNull();
});
