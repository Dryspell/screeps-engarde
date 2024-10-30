import { ErrorMapper } from "utils/ErrorMapper";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";
import { getExits, getUnplannedStructures } from "buildings/utils";
import { architectRoom } from "buildings/architect";
import { getEnergyTargets, getSafeEnergyTargets, TransferTarget } from "creepBehavior/utils";
import {
  type background,
  type email,
  type profile,
  profilerOutput,
  wrap as profilerWrap,
  type restart,
  type stream
} from "utils/screeps-profiler";
import { VISUALIZATION_TOGGLES, visualize } from "visual";
import { dispatchLaborers, dispatchMiners } from "creepBehavior/dispatch";
import { enable as enableProfiler } from "./utils/screeps-profiler";
import MemHack from "utils/memhack";
// Any modules that you use that modify the game's prototypes should be require'd
// before you require the profiler.

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
    cachedPaths: { [sourcePosX: number]: { [sourcePosY: number]: { [x: number]: { [y: number]: string } } } };
    walls: {
      type: "rampart" | "constructedWall";
      planned: boolean;
      pos: {
        x: number;
        y: number;
      };
    }[];
    costMatrix: ReturnType<typeof PathFinder.CostMatrix.serialize>;
  }

  interface Memory {
    uuid: number;
    log: any;
    rooms: { [roomName: string]: RoomMemory };
    visual: typeof VISUALIZATION_TOGGLES;
    cpuResumeAt?: number;
  }

  interface CreepMemory {
    role: keyof typeof ROLES;
    room: string;
    target?: string;
    spawn?: string;
    state?: "harvesting" | "upgrading" | "transferring" | "building" | "dismantling" | "surveying" | "claiming";
    movingTo?: { x: number; y: number };
  }

  interface Game {
    profiler: {
      stream: typeof stream;
      email: typeof email;
      profile: typeof profile;
      background: typeof background;
      restart: typeof restart;
      output: typeof profilerOutput;
    };
  }

  // Syntax for adding properties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }
}

// This line monkey patches the global prototypes.
enableProfiler();

export const loop = ErrorMapper.wrapLoop(() => {
  if (Game.cpu.bucket <= 1000) {
    console.log(`CPU Bucket is low: ${Game.cpu.bucket}`);
    return;
  }
  MemHack.pretick();

  return profilerWrap(() => {
    if (Game.time % 50 === 0) {
      console.log(`[${Game.time.toLocaleString()}] Profiling`);
      Game?.profiler?.stream(10);
    }

    const creeps = Object.values(Game.creeps);
    creeps.forEach(creep => {
      if (!creep.memory.role && !creep.spawning) {
        console.log(`Creep ${creep.name} has no role`);
        if (creep.name.includes("miner")) {
          creep.memory.role = "miner";
        } else if (creep.name.includes("laborer")) {
          creep.memory.role = "laborer";
        }
      }
    });

    const spawns = Object.values(Game.spawns);
    const controlledRooms = Object.values(Game.rooms);
    // console.log(`Controlled Rooms: ${controlledRooms.map(room => room.name).join(", ")}`);

    controlledRooms.forEach(room => {
      const sources = room.find(FIND_SOURCES);
      const spawnsInRoom = spawns.filter(spawn => spawn.room.name === room.name);
      const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
      const droppedResources = room.find(FIND_DROPPED_RESOURCES, {
        filter: resource => resource.resourceType === RESOURCE_ENERGY
      });
      const structures = room.find(FIND_STRUCTURES);

      architectRoom(room, sources, constructionSites, structures);
      // const plannedRoadSteps = getPlannedRoadsSteps(room);

      visualize(room, creeps);

      const ruins = room.find(FIND_RUINS);
      const tombstones = room.find(FIND_TOMBSTONES);
      const unplannedStructures = getUnplannedStructures(room, structures);
      const transferTargets = structures
        .filter(structure => {
          return (
            (structure.structureType == STRUCTURE_EXTENSION ||
              structure.structureType == STRUCTURE_SPAWN ||
              (structure.structureType == STRUCTURE_TOWER &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) >
                  0.1 * structure.store.getCapacity(RESOURCE_ENERGY))) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
          );
        })
        .map(t => ({ type: "transfer", base: t })) as TransferTarget[];

      const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);

      const miners = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "miner");

      const unoccupiedMinerPositions = dispatchMiners(
        room,
        getSafeEnergyTargets(
          sources.map(source => ({ type: "harvest", base: source })),
          hostileCreeps
        ),
        miners,
        hostileCreeps
      );

      const energyTargets = getSafeEnergyTargets(
        getEnergyTargets(droppedResources, structures, ruins, tombstones, sources),
        hostileCreeps
      );

      const laborers = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "laborer");

      if (room.name === "sim") {
        debugger;
      }
      dispatchLaborers(
        laborers,
        spawnsInRoom,
        sources,
        constructionSites,
        structures,
        unplannedStructures,
        energyTargets,
        transferTargets
      );

      towerBehavior(room, structures, hostileCreeps);

      handleSpawning(
        spawnsInRoom,
        creeps.filter(creep => creep.room.name === room.name),
        Boolean(unoccupiedMinerPositions?.length)
      );
    });

    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
      }
    }
  });
});
