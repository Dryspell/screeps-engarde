export const PATH_COLORS = {
  harvesting: "#ffaa00",
  transferring: "#ffffff",
  building: "##00FF00",
  upgrading: "#0000FF",
  claiming: "#FF0000",
  surveying: "#FF00FF"
};

const getSafeEnergyStores = (
  energyStores: (
    | { type: "harvest"; base: Source }
    | { type: "pickup"; base: Resource<RESOURCE_ENERGY> }
    | { type: "withdraw"; base: StructureContainer | StructureStorage | Tombstone | Ruin }
  )[]
) => {
  return energyStores.filter(energyStore => {
    return energyStore.base.pos.findInRange(FIND_HOSTILE_CREEPS, 5).length === 0 && energyStore.type === "harvest"
      ? energyStore.base.energy > 25
      : energyStore.type === "withdraw"
      ? energyStore.base.store[RESOURCE_ENERGY] > 0
      : true;
  });
};

export const getNaiveSources = (
  energyStores: (
    | { type: "harvest"; base: Source }
    | { type: "pickup"; base: Resource<RESOURCE_ENERGY> }
    | { type: "withdraw"; base: StructureContainer | StructureStorage | Tombstone | Ruin }
  )[],
  creep: Creep
) => {
  // If there are hostile creeps, find the closest source with energy that is not within 5 tiles of a hostile creep
  const sortedEnergyStores = getSafeEnergyStores(energyStores)
    .map(store => ({
      ...store,
      path: creep.pos.findPathTo(store.base),
      validPath: creep.pos.findClosestByPath([store.base])
    }))
    .filter(store => store.validPath !== null)
    .sort((a, b) => a.path.length - b.path.length);

  return sortedEnergyStores;
};

export const findNaiveConstructionSite = (constructionSites: ConstructionSite[], creep: Creep) => {
  const sitesByType = constructionSites.reduce((acc, site) => {
    if (!acc[site.structureType]) {
      acc[site.structureType] = [];
    }

    acc[site.structureType].push(site);
    return acc;
  }, {} as Record<BuildableStructureConstant, ConstructionSite[]>);

  if (sitesByType[STRUCTURE_EXTENSION]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_EXTENSION]) ?? sitesByType[STRUCTURE_EXTENSION][0];
  } else if (sitesByType[STRUCTURE_TOWER]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_TOWER]) ?? sitesByType[STRUCTURE_TOWER][0];
  } else if (sitesByType[STRUCTURE_ROAD]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_ROAD]) ?? sitesByType[STRUCTURE_ROAD][0];
  } else {
    return creep.pos.findClosestByPath(constructionSites) ?? constructionSites[0];
  }
};

export const getNaiveTransferTarget = (creep: Creep) => {
  const targets = creep.room.find(FIND_STRUCTURES, {
    filter: structure => {
      return (
        (structure.structureType == STRUCTURE_EXTENSION ||
          structure.structureType == STRUCTURE_SPAWN ||
          structure.structureType == STRUCTURE_TOWER) &&
        structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      );
    }
  });

  return creep.pos.findClosestByPath(targets) as StructureExtension | StructureSpawn;
};
