import { ErrorMapper } from "utils/ErrorMapper";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";
import { getExits } from "buildings/utils";
import { architectRoom } from "architect";

export type MemorizedPath<T extends _HasId | string> = {
  targetId: T extends _HasId ? Id<T> : T;
  path: PathStep[] | null;
  constructedRoad: boolean;
};

declare global {
  interface RoomMemory {
    spawns: {
      id: string;
      pos: RoomPosition;
      pathsToExits: { targetId: string; path: PathStep[] | null; constructedRoad: boolean }[];
      pathToController: MemorizedPath<StructureController> | null;
      pathsToSources: MemorizedPath<Source>[];
      pathsToMinerals: MemorizedPath<Mineral>[];
    }[];
    sources: { id: Id<Source>; pos: RoomPosition; pathToController: MemorizedPath<StructureController> | null }[];
    controller: { id: string; pos: RoomPosition } | undefined;
    minerals: { id: Id<Mineral>; pos: RoomPosition }[];
    towers: {
      id: string;
      pos: RoomPosition;
      planned: boolean;
    }[];
    extensions: { id: string; pos: RoomPosition; planned: boolean }[];
    exits: ReturnType<typeof getExits>;
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

  // Syntax for adding properties to `global` (ex "global.log")
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
  const controlledRooms = Object.values(Game.rooms);

  if (!Memory.rooms) {
    Memory.rooms = {};
  }

  controlledRooms.forEach(room => {
    architectRoom(room);
  });

  handleSpawning(spawns, creeps);

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
