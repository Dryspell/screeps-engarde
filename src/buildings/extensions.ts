import { profileFunction } from "utils/screeps-profiler";
import { getPlannedRoadsSteps } from "./roads";
import { MAX_ROOM_EXTENSIONS } from "./utils";

export const ROOM_EXTENSIONS_WIDTH = 13; // Math.ceil(Math.sqrt(MAX_ROOM_EXTENSIONS[8])) + 5;

export const getExistingExtensions = profileFunction(
  (
    room: Room,
    constructionSites: ConstructionSite<BuildableStructureConstant>[] = room.find(FIND_MY_CONSTRUCTION_SITES),
    extensions = room.find(FIND_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[]
  ) => {
    return (Memory.rooms[room.name].extensions = [
      ...extensions.map(extensions => ({
        id: extensions.id,
        pos: extensions.pos,
        planned: false
      })),
      ...constructionSites
        .filter(site => site.structureType === STRUCTURE_EXTENSION)
        .map(site => ({
          id: site.id,
          pos: site.pos,
          planned: false
        }))
    ]);
  },
  "architect.extensions.getExistingExtensions"
);

const planExtensions = profileFunction(
  (
    spawns: StructureSpawn[],
    room: Room,
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    plannedRoads: PathStep[],
    extensions: StructureExtension[]
  ) => {
    const spaceAroundSpawn = Array.from({ length: ROOM_EXTENSIONS_WIDTH ** 2 }, (_, i) => i).map(i => {
      const x = spawns[0].pos.x + (i % ROOM_EXTENSIONS_WIDTH) - Math.floor(ROOM_EXTENSIONS_WIDTH / 2);
      const y = spawns[0].pos.y + Math.floor(i / ROOM_EXTENSIONS_WIDTH) - Math.floor(ROOM_EXTENSIONS_WIDTH / 2);
      return [x, y] as [x: number, y: number];
    });

    const structuresAroundSpawn = room
      .lookAtArea(
        spawns[0].pos.y - Math.floor(ROOM_EXTENSIONS_WIDTH / 2),
        spawns[0].pos.x - Math.floor(ROOM_EXTENSIONS_WIDTH / 2),
        spawns[0].pos.y + Math.floor(ROOM_EXTENSIONS_WIDTH / 2),
        spawns[0].pos.x + Math.floor(ROOM_EXTENSIONS_WIDTH / 2),
        true
      )
      .filter(
        lookResult =>
          lookResult.type !== "creep" &&
          lookResult.type !== "tombstone" &&
          !(lookResult.type === "terrain" && (lookResult.terrain === "swamp" || lookResult.terrain === "plain")) &&
          lookResult.type !== "ruin"
      )
      .map(({ x, y }) => ({ x, y }))
      .concat(constructionSites.map(({ pos }) => ({ x: pos.x, y: pos.y })))
      .concat(plannedRoads)
      .concat(Memory.rooms[room.name].towers.map(tower => ({ x: tower.pos.x, y: tower.pos.y })));

    const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
      ([x, y]) => !structuresAroundSpawn.some(lookObject => lookObject.x === x && lookObject.y === y)
    );

    // console.log(
    //   `[${Game.time.toLocaleString()}] Room ${room.name} has ${freeSpaceAroundSpawn.length} free spaces for extensions`
    // );
    // Memorize the free space around the spawn as planned extensions
    freeSpaceAroundSpawn.forEach(([x, y]) => {
      if (!Memory.rooms[room.name].extensions.some(extension => extension.pos.x === x && extension.pos.y === y)) {
        Memory.rooms[room.name].extensions.push({
          id: extensions.find(extension => extension.pos.x === x && extension.pos.y === y)?.id ?? "",
          pos: new RoomPosition(x, y, room.name),
          planned: true
        });
      }
    });
  },
  "architect.extensions.planExtensions"
);

const buildExtensions = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    extensions: StructureExtension[],
    roomController: StructureController
  ) => {
    if (extensions.length >= MAX_ROOM_EXTENSIONS[(room.controller?.level ?? 0) as keyof typeof MAX_ROOM_EXTENSIONS]) {
      return;
    }

    const closestToSpawnExts = Memory.rooms[room.name].extensions.sort(
      (extA, extB) =>
        spawns[0].pos.getRangeTo(extA.pos.x, extA.pos.y) - spawns[0].pos.getRangeTo(extB.pos.x, extB.pos.y)
    );

    for (const ext of closestToSpawnExts) {
      const constructionResult = room.createConstructionSite(ext.pos.x, ext.pos.y, STRUCTURE_EXTENSION);
      if (constructionResult === OK) {
        console.log(`[${Game.time.toLocaleString()}] ${room.name} Building extension at ${ext.pos.x}, ${ext.pos.y}`);
        room.visual.text(`🏗️ Building Extension`, ext.pos.x + 1, ext.pos.y, {
          align: "left",
          opacity: 0.8
        });
        const existingMemorizedExtension = Memory.rooms[room.name].extensions.find(
          extension => extension.pos.x === ext.pos.x && extension.pos.y === ext.pos.y
        );
        if (existingMemorizedExtension) {
          existingMemorizedExtension.planned = true;
        } else {
          Memory.rooms[room.name].extensions.push(ext);
        }

        break;
      } else {
        console.log(
          `[${Game.time.toLocaleString()}] ${room.name} Error building extension at ${ext.pos.x}, ${
            ext.pos.y
          }: ${constructionResult}`
        );
      }
    }
  },
  "architect.extensions.buildExtensions"
);

export const planAndBuildExtensions = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    extensions = room.find(FIND_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[],
    plannedRoads = getPlannedRoadsSteps(room)
  ) => {
    // if (!Memory.rooms[room.name].extensions?.length || !extensions.length) {
    //   Memory.rooms[room.name].extensions = getExistingExtensions(room, constructionSites, extensions);
    // }

    if (Memory.rooms[room.name].extensions.length < MAX_ROOM_EXTENSIONS[8]) {
      console.log(
        `[${Game.time.toLocaleString()}] Planning extensions for ${room.name}, currently planned extensions: ${
          Memory.rooms[room.name].extensions.length
        }`
      );
      planExtensions(spawns, room, constructionSites, plannedRoads, extensions);
    }

    const extensionConstructionSites = constructionSites.filter(site => site.structureType === STRUCTURE_EXTENSION);
    if (extensionConstructionSites.length) {
      return;
    }

    if (
      extensions.length + extensionConstructionSites.length <
      MAX_ROOM_EXTENSIONS[(room.controller?.level ?? 0) as keyof typeof MAX_ROOM_EXTENSIONS]
    ) {
      console.log(
        `[${Game.time.toLocaleString()}] ${room.name} has ${extensions.length} extensions, ${
          extensionConstructionSites.length
        } extension construction sites, and ${
          MAX_ROOM_EXTENSIONS[(room.controller?.level ?? 0) as keyof typeof MAX_ROOM_EXTENSIONS]
        } max extensions`
      );

      buildExtensions(room, spawns, constructionSites, extensions, roomController);
    }
  },
  "architect.extensions.planAndBuildExtensions"
);
