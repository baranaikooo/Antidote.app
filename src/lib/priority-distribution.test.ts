import { expect, it } from "vitest";
import {
  priorityDistributionFromPercentages,
  readPriorityDistribution,
} from "./priority-distribution";

it("preserves the exact ten tokens in stable category order", () => {
  expect(
    priorityDistributionFromPercentages({
      sloboda: 50,
      stabilita: 0,
      kariera: 20,
      rodina: 30,
      kreativita: 0,
    }),
  ).toEqual([3, 2, 0, 0, 5]);
});

it("does not infer a distribution for missing or invalid allocations", () => {
  expect(readPriorityDistribution(undefined)).toBeUndefined();
  expect(readPriorityDistribution([5, 5, 0, 0])).toBeUndefined();
  expect(readPriorityDistribution([6, 4, 0, 0, 0])).toBeUndefined();
  expect(readPriorityDistribution([5, 4, 0, 0, 0])).toBeUndefined();
  expect(readPriorityDistribution([5, 4, 0.5, 0.5, 0])).toBeUndefined();
});
