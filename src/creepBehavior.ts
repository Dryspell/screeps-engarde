const PATH_COLORS = {
  harvesting: "#ffaa00",
  transferring: "#ffffff",
  building: "##00FF00",
  upgrading: "#0000FF"
};

const getNaiveSource = (sources: Source[], creep: Creep) => {
  const sourcesWithEnergy = sources.filter(source => source.energy > 0);

  return creep.pos.findClosestByPath(sourcesWithEnergy) ?? sources[0];
};

const findNaiveTarget = (targets: ConstructionSite[], creep: Creep) => {
  return creep.pos.findClosestByPath(targets) ?? targets[0];
};

const getNaiveTransferTarget = (creep: Creep) => {
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

export const harvesterTick = (creep: Creep) => {
  if (creep.store.getFreeCapacity() > 0) {
    const sources = creep.room.find(FIND_SOURCES);
    const naivestSource = getNaiveSource(sources, creep);

    if (creep.harvest(naivestSource) === ERR_NOT_IN_RANGE) {
      creep.memory.target = naivestSource.id;
      creep.memory.state = "harvesting";

      creep.say(creep.memory.state);
      // const message = `[${creep.name}]: Moving to source ${naivestSource.id} at ${naivestSource.pos}`;
      // console.log(message);
      creep.moveTo(naivestSource, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
    }
  } else {
    const transferTarget = getNaiveTransferTarget(creep);
    if (creep.transfer(transferTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      creep.memory.target = transferTarget.id;
      creep.memory.state = "transferring";
      creep.say(creep.memory.state);

      // const message = `[${creep.name}]: Moving to ${transferTarget.id} at ${transferTarget.pos}`;
      // console.log(message);
      creep.moveTo(transferTarget, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
    }
  }
};

export const upgraderTick = (creep: Creep) => {
  if (creep.store[RESOURCE_ENERGY] == 0 || (creep.memory.state === "harvesting" && creep.store.getFreeCapacity() > 0)) {
    const sources = creep.room.find(FIND_SOURCES);
    const naivestSource = getNaiveSource(sources, creep);
    const closestSource = creep.pos.findClosestByPath(sources);

    if (creep.harvest(closestSource ?? naivestSource) == ERR_NOT_IN_RANGE) {
      creep.memory.target = closestSource?.id ?? naivestSource.id;
      creep.memory.state = "harvesting";
      creep.say(creep.memory.state);

      // const message = `[${creep.name}]: Moving to source ${closestSource?.id ?? naivestSource.id} at ${
      //   closestSource?.pos ?? naivestSource.pos
      // }`;
      // console.log(message);
      creep.moveTo(closestSource ?? naivestSource, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
    }
  } else {
    if (creep.room.controller && creep.upgradeController(creep.room.controller) == ERR_NOT_IN_RANGE) {
      creep.memory.target = creep.room.controller.id;
      creep.memory.state = "upgrading";
      creep.say(creep.memory.state);

      // const message = `[${creep.name}]: Moving to controller ${creep.room.controller.id} at ${creep.room.controller.pos}`;
      // console.log(message);
      creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
    }
  }
};

export const builderTick = (creep: Creep) => {
  if (creep.memory.state === "building" && creep.store[RESOURCE_ENERGY] == 0) {
    creep.memory.state = "harvesting";
    creep.say(creep.memory.state);
  }
  if (creep.memory.state !== "building" && creep.store.getFreeCapacity() == 0) {
    creep.memory.state = "building";
    creep.say(creep.memory.state);
  }

  if (creep.memory.state === "building") {
    const targets = creep.room.find(FIND_CONSTRUCTION_SITES);
    if (targets.length) {
      const target = findNaiveTarget(targets, creep);

      if (creep.build(target) == ERR_NOT_IN_RANGE) {
        creep.memory.target = target.id;

        // const message = `[${creep.name}]: Moving to construction site ${target.id} at ${target.pos}`;
        // console.log(message);
        creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
      }
    }
  } else {
    const sources = creep.room.find(FIND_SOURCES);
    const naivestSource = getNaiveSource(sources, creep);

    if (creep.harvest(naivestSource) == ERR_NOT_IN_RANGE) {
      creep.moveTo(naivestSource, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] } });
    }
  }
};
