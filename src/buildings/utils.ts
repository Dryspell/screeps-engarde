import { profileFunction } from "utils/screeps-profiler";
import { getPlannedRoadsSteps } from "./roads";
import { costCallback } from "spatial/spatial-utils";

export const MAX_ROOM_EXTENSIONS = {
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60
} as const;

export const buildRoadFromPosToSet = profileFunction(
  (room: Room, pos: RoomPosition, set: RoomPosition[], omitLast: boolean = true) => {
    const posPathsToSet = set
      .map(source =>
        pos.findPathTo(source, {
          ignoreCreeps: true,
          costCallback: costCallback(Memory.rooms[room.name].paths?.map(p => p.path) ?? [])
        })
      )
      .sort((a, b) => a.length - b.length)
      .map(path => (omitLast ? path.slice(0, path.length - 1) : path));

    for (const path of posPathsToSet) {
      for (const pathStep of path) {
        if (
          room
            .lookForAt(LOOK_STRUCTURES, pathStep.x, pathStep.y)
            .some(structure => structure.structureType === STRUCTURE_ROAD)
        ) {
          continue;
        }

        if (room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD) === OK) {
          room.visual.text(`🚦 Building Road`, pathStep.x + 1, pathStep.y, {
            align: "left",
            opacity: 0.8
          });
          console.log(`[${Game.time.toLocaleString()}] Building road at ${pathStep.x}, ${pathStep.y}`);
          return 1;
        }
      }
    }
    return 0;
  },
  "buildings.roads.buildRoadFromPosToSet"
);

export const getExits = profileFunction((room: Room) => {
  try {
    return Object.entries(Game.map.describeExits(room.name)).map(([dir, roomName]) => {
      // console.log(`[${Game.time.toLocaleString()}] Exits: ${dir} - ${roomName}`);
      const exitDirection = parseInt(dir);

      return { exitDirection, roomName };
    }) as {
      exitDirection: FIND_EXIT_TOP | FIND_EXIT_RIGHT | FIND_EXIT_BOTTOM | FIND_EXIT_LEFT;
      roomName: string;
    }[];
  } catch (e) {
    // console.log(`[${Game.time.toLocaleString()}] Error getting exits: ${e}`);
    return [];
  }
}, "spatial.getExits");

export const getUnplannedStructures = profileFunction(
  (
    room: Room,
    structures = room.find(FIND_STRUCTURES),
    constructionSites = room.find(FIND_CONSTRUCTION_SITES),
    plannedRoadSteps = getPlannedRoadsSteps(room)
  ) => {
    // If there is a building that is unplanned, dismantle it
    const extensions = structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION);

    // const plannedExtensions = Memory.rooms[room.name].extensions
    //   .filter(struct => struct.planned === true)
    //   .map(extension => `${extension.pos.x}_${extension.pos.y}`);

    if (!plannedRoadSteps.length) {
      return extensions as AnyStructure[];
    }

    const plannedRoads = plannedRoadSteps.map(road => `${road.x}_${road.y}`);
    // if (extensions.some(extension => plannedRoads.includes(`${extension.pos.x}_${extension.pos.y}`))) {
    //   console.log(`Unexpected overlap between planned extensions and roads`);
    //   console.log(`Recomputing planned extensions`);
    //   Memory.rooms[room.name].extensions = getExistingExtensions(room);
    //   // return;
    // }

    const unplannedConstructionSites = constructionSites.filter(
      site => site.structureType !== STRUCTURE_ROAD && plannedRoads.includes(`${site.pos.x}_${site.pos.y}`)
    );

    unplannedConstructionSites.forEach(site => {
      if (site.structureType === STRUCTURE_EXTENSION) {
        site.remove();
      }
      // console.log(`[${Game.time.toLocaleString()}]: Unplanned structure found at ${structure.pos}`);
      room.visual.text("X!", site.pos.x, site.pos.y, { color: "red" });
    });

    const unplannedStructures = extensions.filter(structure =>
      plannedRoads.includes(`${structure.pos.x}_${structure.pos.y}`)
    );

    if (unplannedStructures.length) {
      unplannedStructures.forEach(structure => {
        // console.log(`[${Game.time.toLocaleString()}]: Unplanned structure found at ${structure.pos}`);
        room.visual.text("X!", structure.pos.x, structure.pos.y, { color: "red" });
      });
    }

    return unplannedStructures as AnyStructure[];
  },
  "buildings.getUnplannedStructures"
);
