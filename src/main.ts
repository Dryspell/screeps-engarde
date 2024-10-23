import { ErrorMapper } from "utils/ErrorMapper";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";
import { getExits } from "buildings/utils";
import { architectRoom } from "architect";
import { getUnplannedStructures } from "creepBehavior/laborer";

declare global {
  interface RoomMemory {
    spawns: {
      id: string;
      pos: RoomPosition;
    }[];
    sources: { id: Id<Source>; pos: RoomPosition }[];
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
    paths: { path: PathStep[]; constructedRoad: boolean }[];
    minerPositions: { x: number; y: number }[];
    terrain: RoomTerrain;
    lastMemorizedTick: typeof Game.time;
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
    const sources = room.find(FIND_SOURCES);
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const droppedResources = room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    });
    const structures = room.find(FIND_MY_STRUCTURES);

    architectRoom(room, sources, constructionSites, structures);

    const ruins = room.find(FIND_RUINS);
    const tombstones = room.find(FIND_TOMBSTONES);
    const unplannedStructures = getUnplannedStructures(room, structures);

    creeps
      .filter(creep => creep.room.name === room.name)
      .forEach(creep => {
        if (!ROLES[creep.memory.role]) {
          creep.memory.role = "laborer";
        }

        // TODO: K-means clustering for available energy sources for creeps that are in harvesting state
        // BFR Algorithm to choose k centroids
        // Choose k random points, find centroid
        // Choose k-1 points that are farthest from the centroid, find centroid
        // repeat until k centroids are found
        // Cluster using these centroids
        // Do we even need to do this or just use the closest source?

        ROLES[creep.memory.role].tick(
          creep,
          sources,
          constructionSites,
          droppedResources,
          structures,
          ruins,
          tombstones,
          unplannedStructures
        );
      });
  });

  handleSpawning(spawns, creeps);

  towerBehavior(controlledRooms);

  // Automatically delete memory of missing creeps
  for (const name in Memory.creeps) {
    if (!(name in Game.creeps)) {
      delete Memory.creeps[name];
    }
  }
});
