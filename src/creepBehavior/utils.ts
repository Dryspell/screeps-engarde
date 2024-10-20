export const PATH_COLORS = {
  harvesting: "#ffaa00",
  transferring: "#ffffff",
  building: "##00FF00",
  upgrading: "#0000FF",
  claiming: "#FF0000",
  surveying: "#FF00FF"
};

export const getNaiveSource = (sources: Source[], creep: Creep) => {
  const sourcesWithEnergy = sources.filter(source => source.energy > 0);

  return creep.pos.findClosestByPath(sourcesWithEnergy) ?? sources[0];
};

export const findNaiveTarget = (targets: ConstructionSite[], creep: Creep) => {
  return creep.pos.findClosestByPath(targets) ?? targets[0];
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
