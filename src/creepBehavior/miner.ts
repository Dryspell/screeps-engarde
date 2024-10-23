import { getUnplannedStructures, switchState } from "./laborer";
import { EnergyTarget, getNaiveSources, PATH_COLORS } from "./utils";

const attemptToBuildCloseConstructionSites = (
  creep: Creep,
  closeConstructionSites = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)
) => {
  if (!creep.body.some(part => part.type === "carry")) {
    return;
  }

  for (const site of closeConstructionSites) {
    const buildResult = creep.build(site);
    if (buildResult === OK) {
      return;
    } else {
      console.log(`[${creep.name}]: Failed to build ${site.id} with result ${buildResult}`);
    }
  }
};

export const minerTick = (
  creep: Creep,
  sources: Source[] = creep.room.find(FIND_SOURCES),
  constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES),
  droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: resource => resource.resourceType === RESOURCE_ENERGY
  }),
  structures = creep.room.find(FIND_MY_STRUCTURES),
  ruins = creep.room.find(FIND_RUINS),
  tombstones = creep.room.find(FIND_TOMBSTONES),
  unplannedStructures = getUnplannedStructures(creep.room),
  energyTarget: EnergyTarget | undefined
) => {
  switchState(creep, "harvesting");

  const adjacentSource = sources.find(source => creep.pos.isNearTo(source));

  if (adjacentSource) {
    const closeConstructionSites = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3);

    if (
      (creep.store.getCapacity(RESOURCE_ENERGY) &&
        !creep.store.getFreeCapacity(RESOURCE_ENERGY) &&
        closeConstructionSites.length) ||
      creep.harvest(adjacentSource) === ERR_NOT_ENOUGH_RESOURCES
    ) {
      attemptToBuildCloseConstructionSites(creep, closeConstructionSites);
    }
  } else {
    const naiveEnergyTargets = energyTarget ? getNaiveSources([energyTarget], creep) : [];

    const naivestSources = naiveEnergyTargets.length
      ? naiveEnergyTargets
      : getNaiveSources(
          sources.map(source => ({ type: "harvest", base: source })),
          creep
        );

    if (!naivestSources.length) {
      console.log(`[${creep.name}]: No sources found to harvest`);
      return;
    }

    const target = naivestSources[0];
    if (target.type !== "harvest") {
      console.error(`[${creep.name}]: Expected target to be a harvest source, but got ${target.type}`);
      return;
    }

    if (creep.harvest(target.base) === ERR_NOT_IN_RANGE) {
      creep.memory.target = target.base.id;
      creep.moveTo(target.base, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] } });
    } else if (creep.harvest(target.base) === ERR_NOT_ENOUGH_RESOURCES) {
      console.log(`[${creep.name}]: Source ${target.base.id} is empty`);
      attemptToBuildCloseConstructionSites(creep);
    }
  }
};
