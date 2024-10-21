import { getNaiveSource, getNaiveTransferTarget, PATH_COLORS } from "./utils";

export const harvesterTick = (creep: Creep) => {
  if (creep.room.energyAvailable >= creep.room.energyCapacityAvailable) {
    if (
      creep.room.find(FIND_MY_CONSTRUCTION_SITES).length &&
      creep.room.controller &&
      creep.room.controller.ticksToDowngrade > 1000
    ) {
      creep.memory.role = "builder";
      creep.say("builder");
      console.log(`[${creep.name}]: Switching to builder`);
      return;
    } else {
      creep.memory.role = "upgrader";
      creep.say("upgrader");
      console.log(`[${creep.name}]: Switching to upgrader`);

      return;
    }
  }

  if (creep.store[RESOURCE_ENERGY] === 0) {
    const sources = creep.room.find(FIND_SOURCES);
    const naivestSource = getNaiveSource(sources, creep);
    if (!naivestSource) return;

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
