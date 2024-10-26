import { ErrorMapper } from "utils/ErrorMapper";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";
import { getExits, getUnplannedStructures } from "buildings/utils";
import { architectRoom } from "buildings/architect";
import { kmeans } from "spatial/spatial-utils";
import { cachePath, EnergyTarget, getEnergyTargets, getSafeEnergyTargets } from "creepBehavior/utils";
import {
  type background,
  type email,
  enable as enableProfiler,
  type profile,
  profileFunction,
  profilerOutput,
  wrap as profilerWrap,
  type restart,
  type stream
} from "utils/screeps-profiler";
import { randomColors, VISUALIZATION_TOGGLES, visualize, visualizeKmeans } from "visual";
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
  }

  interface CreepMemory {
    role: keyof typeof ROLES;
    room: string;
    target?: string;
    spawn?: string;
    state?: "harvesting" | "upgrading" | "transferring" | "building" | "surveying" | "claiming";
    // working: boolean;
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

const colors = randomColors(30);

export const loop = ErrorMapper.wrapLoop(() =>
  profilerWrap(() => {
    // console.log(`Current game tick is ${Game.time.toLocaleString()}`);

    if (Game.cpu.bucket < 500) {
      Game.time % 20 === 0 && console.log(`Bucket is low: ${Game.cpu.bucket}`);
      return;
    }

    if (Game.time % 20 === 0) {
      console.log(`[${Game.time.toLocaleString()}] Profiling`);
      Game.profiler.stream(3);
    }

    const creeps = Object.values(Game.creeps);
    const spawns = Object.values(Game.spawns);
    const controlledRooms = Object.values(Game.rooms);

    controlledRooms.forEach(room => {
      const sources = room.find(FIND_SOURCES);
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
      const transferTargets = structures.filter(structure => {
        return (
          (structure.structureType == STRUCTURE_EXTENSION ||
            structure.structureType == STRUCTURE_SPAWN ||
            (structure.structureType == STRUCTURE_TOWER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0.1 * structure.store.getCapacity(RESOURCE_ENERGY))) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
      }) as (StructureExtension | StructureSpawn | StructureTower)[];

      const miners = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "miner");

      dispatchByEnergySource(
        sources.map(source => ({ type: "harvest", base: source })),
        miners,
        sources,
        constructionSites,
        droppedResources,
        structures,
        ruins,
        tombstones,
        unplannedStructures,
        transferTargets
      );

      const energyTargets = getSafeEnergyTargets(
        getEnergyTargets(droppedResources, structures, ruins, tombstones, sources)
      );

      const laborers = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "laborer");

      dispatchByEnergySource(
        energyTargets,
        laborers,
        sources,
        constructionSites,
        droppedResources,
        structures,
        ruins,
        tombstones,
        unplannedStructures,
        transferTargets
      );
    });

    handleSpawning(spawns, creeps);

    towerBehavior(controlledRooms);

    // Automatically delete memory of missing creeps
    for (const name in Memory.creeps) {
      if (!(name in Game.creeps)) {
        delete Memory.creeps[name];
      }
    }
  })
);

const useKmeans = true;

function dispatchByEnergySource(
  energyTargets: EnergyTarget[],
  creeps: Creep[],
  sources: Source[],
  constructionSites: ConstructionSite<BuildableStructureConstant>[],
  droppedResources: Resource<ResourceConstant>[],
  structures: AnyStructure[],
  ruins: Ruin[],
  tombstones: Tombstone[],
  unplannedStructures: AnyStructure[],
  transferTargets: (StructureExtension | StructureSpawn | StructureTower)[]
) {
  if (!useKmeans) {
    creeps.forEach(creep =>
      ROLES[creep.memory.role].tick(
        creep,
        sources,
        constructionSites,
        droppedResources,
        structures,
        ruins,
        tombstones,
        unplannedStructures,
        energyTargets,
        energyTargets,
        transferTargets
      )
    );
  } else {
    const creepClusters = kmeans(energyTargets.length, creeps).filter(c => c.cluster.length);

    if (Memory.visual.kmeans) {
      visualizeKmeans(creepClusters, colors);
    }

    const sourcesByCluster = energyTargets.map(energyTarget => {
      return {
        energyTarget,
        creepCluster: creepClusters
          .sort((a, b) => cachePath(a.centroid, energyTarget).length - cachePath(b.centroid, energyTarget).length)
          .shift()
      };
    });
    sourcesByCluster.forEach(sbc => {
      sbc.creepCluster?.cluster.forEach(creep => {
        ROLES[creep.memory.role].tick(
          creep,
          sources,
          constructionSites,
          droppedResources,
          structures,
          ruins,
          tombstones,
          unplannedStructures,
          energyTargets,
          [sbc.energyTarget],
          transferTargets
        );
      });
    });
  }
}
