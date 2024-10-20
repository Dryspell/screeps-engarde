import { ErrorMapper } from "utils/ErrorMapper";
import { handleBuilding } from "buildings/construction";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";

declare global {
  interface RoomMemory {
    spawns: { id: string; pos: RoomPosition }[];
    sources: { id: string; pos: RoomPosition }[];
    controller: { id: string; pos: RoomPosition } | undefined;
    containsHostiles: boolean;
  }

  interface Memory {
    uuid: number;
    log: any;
    rooms: { [roomName: string]: RoomMemory };
  }

  interface CreepMemory {
    role: keyof typeof ROLES;
    room: string;
    target?: string;
    spawn?: string;
    state?: "harvesting" | "upgrading" | "transferring" | "building" | "surveying" | "claiming";
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

  const controlledRooms = Object.values(Game.rooms);
  handleBuilding(controlledRooms);

  creeps.forEach(creep => {
    // console.log(`Creep: ${creep.name} - Role: ${creep.memory.role}`);
    ROLES[creep.memory.role].tick(creep);
  });

  towerBehavior(controlledRooms);

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
});
