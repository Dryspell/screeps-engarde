import { ErrorMapper } from "utils/ErrorMapper";
import { handleSpawning } from "spawning/spawning";
import { towerBehavior } from "buildings/towers";
import { ROLES } from "creepBehavior/roles";
import { getExits } from "buildings/utils";
import { architectRoom } from "architect";
import { getUnplannedStructures } from "creepBehavior/laborer";
import { kmeans } from "spatial-utils";
import { EnergyTarget, getEnergyTargets } from "creepBehavior/utils";
import { enable as enableProfiler, wrap as profilerWrap } from "utils/screeps-profiler";
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
  }

  interface Memory {
    uuid: number;
    log: any;
    rooms: { [roomName: string]: RoomMemory };
    cachedPaths: { [sourcePos: string]: number[][] };
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

// This line monkey patches the global prototypes.
enableProfiler();

export const loop = ErrorMapper.wrapLoop(() =>
  profilerWrap(() => {
    // console.log(`Current game tick is ${Game.time.toLocaleString()}`);

    if (Game.cpu.bucket < 100) {
      Game.time % 20 === 0 && console.log(`Bucket is low: ${Game.cpu.bucket}`);
      return;
    }

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
        unplannedStructures
      );

      const energyTargets = getEnergyTargets(droppedResources, structures, ruins, tombstones, sources);

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
        unplannedStructures
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

function dispatchByEnergySource(
  energyTargets: EnergyTarget[],
  creeps: Creep[],
  sources: Source[],
  constructionSites: ConstructionSite<BuildableStructureConstant>[],
  droppedResources: Resource<ResourceConstant>[],
  structures: AnyOwnedStructure[],
  ruins: Ruin[],
  tombstones: Tombstone[],
  unplannedStructures: AnyOwnedStructure[]
) {
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
      energyTargets
    )
  );

  // const creepClusters = kmeans(energyTargets.length, creeps);

  // const sourcesByCluster = energyTargets.map(energyTarget => {
  //   return {
  //     energyTarget,
  //     creepCluster: creepClusters
  //       .sort(
  //         (a, b) =>
  //           energyTarget.base.pos.findPathTo(a.centroid.pos.x, a.centroid.pos.y).length -
  //           energyTarget.base.pos.findPathTo(b.centroid.pos.x, b.centroid.pos.y).length
  //       )
  //       .shift()
  //   };
  // });

  // sourcesByCluster.forEach(sbc => {
  //   sbc.creepCluster?.cluster.forEach(creep => {
  //     ROLES[creep.memory.role].tick(
  //       creep,
  //       sources,
  //       constructionSites,
  //       droppedResources,
  //       structures,
  //       ruins,
  //       tombstones,
  //       unplannedStructures,
  //       sbc.energyTarget
  //     );
  //   });
  // });
}
