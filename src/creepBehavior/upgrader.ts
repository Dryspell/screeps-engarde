import { getNaiveSource, PATH_COLORS } from "./utils";

export const upgraderTick = (creep: Creep) => {
  if (creep.room.energyAvailable < creep.room.energyCapacityAvailable) {
    creep.memory.role = "harvester";
    creep.say("harvester");
    console.log(`[${creep.name}]: Switching to harvester`);

    return;
  }

  if (creep.store[RESOURCE_ENERGY] == 0 || (creep.memory.state === "harvesting" && creep.store.getFreeCapacity() > 0)) {
    const sources = creep.room.find(FIND_SOURCES);
    const naivestSource = getNaiveSource(sources, creep);
    if (!naivestSource) return;

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
