import { profileFunction } from "utils/screeps-profiler";
import { switchState } from "./laborer";
import { EnergyTarget, getClosestSources, moveToTargetByCachedPath, PATH_COLORS, TransferTarget } from "./utils";
import { getUnplannedStructures } from "buildings/utils";
import { splitByAdjacency } from "spatial/spatial-utils";

const attemptToBuildCloseConstructionSites = (
  creep: Creep,
  closeConstructionSites = creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)
) => {
  if (!creep.body.some(part => part.type === "carry")) {
    return ERR_NO_BODYPART;
  } else if (!creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
    return ERR_NOT_ENOUGH_RESOURCES;
  }

  for (const site of closeConstructionSites) {
    const buildResult = creep.build(site);
    if (buildResult === OK) {
      return;
    } else {
      console.log(`[${creep.room.name}]: ${creep.name} Failed to build ${site.id} with result ${buildResult}`);
      return buildResult;
    }
  }
  return ERR_NOT_FOUND;
};

export const minerTick = profileFunction((creep: Creep, energyTargets: EnergyTarget[]) => {
  switchState(creep, "harvesting");

  const { adjacent, nonAdjacent } = splitByAdjacency(creep, energyTargets);

  if (
    adjacent.length &&
    creep.body.some(part => part.type === "carry") &&
    !creep.store.getFreeCapacity(RESOURCE_ENERGY)
  ) {
    const closeConstructionSites = creep.body.some(part => part.type === "carry")
      ? creep.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3)
      : [];

    if (
      (creep.store.getCapacity(RESOURCE_ENERGY) &&
        !creep.store.getFreeCapacity(RESOURCE_ENERGY) &&
        closeConstructionSites.length) ||
      (adjacent[0].type === "harvest" && adjacent[0].base.energy <= 0 && closeConstructionSites.length)
    ) {
      attemptToBuildCloseConstructionSites(creep, closeConstructionSites);
    }
  } else if (adjacent.length && adjacent[0].type === "harvest") {
    if (adjacent[0].base.energy) {
      const harvestResult = creep.harvest(adjacent[0].base);
      if (harvestResult !== OK) {
        console.log(
          `[${Game.time.toLocaleString()}]: Room ${creep.room.name} ${creep.name} Failed to harvest ${
            adjacent[0].base.id
          } with result ${harvestResult}`
        );
      }
    }
  } else {
    const naivestSources = getClosestSources(nonAdjacent, creep);

    if (!naivestSources.length) {
      console.log(
        `[${Game.time.toLocaleString()}]: Room ${creep.room.name} ${creep.name}: No sources found to harvest`
      );
      return;
    }

    const target = naivestSources[0];
    if (target.type !== "harvest") {
      console.log(
        `[${Game.time.toLocaleString()}]: Room ${creep.room.name} ${
          creep.name
        }: Expected target to be a harvest source, but got ${target.type}`
      );
      return;
    }

    if (creep.harvest(target.base) === ERR_NOT_IN_RANGE) {
      creep.memory.target = target.base.id;
      creep.moveTo(target.base, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] } });
    } else if (creep.harvest(target.base) === ERR_NOT_ENOUGH_RESOURCES) {
      console.log(
        `[${Game.time.toLocaleString()}]: Room ${creep.room.name} ${creep.name}: Source ${target.base.id} is empty`
      );
      attemptToBuildCloseConstructionSites(creep);
    }
  }
}, "creeps.behavior.miner.tick");
