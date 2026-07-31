import {
  buildCoverageModel,
  buildTerritoryHealth,
  buildGapPlacementPlan
} from "../../core/coverage-engine.js";

export const premiumAnalytics = {
  coverageModel: buildCoverageModel,
  territoryHealth: buildTerritoryHealth,
  placementPlan: buildGapPlacementPlan
};
