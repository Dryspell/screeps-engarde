import { ErrorMapper } from "utils/ErrorMapper";
import { handleBuilding } from "building";
import { handleSpawning, ROLES } from "spawning";

declare global {
  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    role: keyof typeof ROLES;
    room: string;
    target?: string;
    spawn?: string;
    state?: "harvesting" | "upgrading" | "transferring" | "building";
    // working: boolean;
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }
}

export const loop = ErrorMapper.wrapLoop(() => {
  // console.log(`Current game tick is ${Game.time.toLocaleString()}`);
  const creeps = Object.values(Game.creeps);
  const spawns = Object.values(Game.spawns);

  handleSpawning(spawns, creeps);

  const controlledRooms = spawns.map(spawn => spawn.room);
  handleBuilding(controlledRooms);

  creeps.forEach(creep => {
    // console.log(`Creep: ${creep.name} - Role: ${creep.memory.role}`);
    ROLES[creep.memory.role].tick(creep);
  });

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
});
