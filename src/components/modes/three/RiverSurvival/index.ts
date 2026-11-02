export {
  RIVER_SURVIVAL_CATALOG_ASSETS,
  RIVER_SURVIVAL_ZONES,
  computePenSlotPositions,
  findZoneAtPosition,
  resolveSurvivalAssetUrls,
  verifySurvivalCatalogAssets,
  type SurvivalZoneId,
  type SurvivalZoneSpec,
  type ZoneAssetPlacement,
} from './zones';

export {
  createWoodenPen,
  type WoodenPenOptions,
  type WoodenPenRig,
} from './WoodenPen';

export {
  createTagNet,
  type TagNetOptions,
  type TagNetOwnerState,
  type TagNetRig,
} from './TagNet';

export {
  buildRiverSurvivalEnvironment,
  mountRiverSurvivalScene,
  type MountedRiverSurvivalScene,
  type RiverSurvivalEnvOptions,
  type RiverSurvivalEnvironment,
} from './RiverSurvivalScene';

export {
  default as RiverSurvivalStage,
  type RiverSurvivalStageProps,
} from './RiverSurvivalStage';
