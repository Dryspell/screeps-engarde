import { profileFunction } from "utils/screeps-profiler";

const MAX_CONTAINERS_IN_ROOM = 5;

export const planAndBuildContainers = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    structures: Structure<StructureConstant>[]
  ) => {
    const containers = [
      ...(structures.filter(structure => structure.structureType === STRUCTURE_CONTAINER) as StructureContainer[]),
      ...constructionSites.filter(site => site.structureType === STRUCTURE_CONTAINER)
    ];

    if (containers.length < MAX_CONTAINERS_IN_ROOM) {
      const referencePosition = spawns[0].pos ?? room.controller?.pos ?? { x: 25, y: 25 };
      for (const position of Memory.rooms[room.name].minerPositions
        .sort(
          (posA, posB) => referencePosition.getRangeTo(posA.x, posA.y) - referencePosition.getRangeTo(posB.x, posB.y)
        )
        .slice(containers.length, MAX_CONTAINERS_IN_ROOM)) {
        if (room.createConstructionSite(position.x, position.y, STRUCTURE_CONTAINER) === OK) {
          console.log(`[${Game.time.toLocaleString()}] Building container at ${position.x}, ${position.y}`);
          room.visual.text(`🏗️ Building Container`, position.x + 1, position.y, {
            align: "left",
            opacity: 0.8
          });
        }
      }
    }
  },
  "architect.containers.planAndBuildContainers"
);
