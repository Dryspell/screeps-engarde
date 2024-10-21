import { handleBuildingTowers } from "../buildings/towers";
import { buildRoadFromPosToSet, getExits, MAX_ROOM_EXTENSIONS } from "../buildings/utils";

export const handleBuilding = (controlledRooms: Room[]) => {
  controlledRooms.forEach(room => {
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[];
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
    const roomSources = room.find(FIND_SOURCES);

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    if (!spawn && room.controller && !constructionSites.filter(site => site.structureType === STRUCTURE_SPAWN).length) {
      // If there is no spawn and no spawn construction site, create a spawn construction site at the centroid of the sources and controller

      const spawnPos = [room.controller, ...roomSources]
        .reduce((acc, structure) => [acc[0] + structure.pos.x, acc[1] + structure.pos.y] as [x: number, y: number], [
          0, 0
        ] as [x: number, y: number])
        .map(coord => Math.floor(coord / (roomSources.length + 1))) as [x: number, y: number];

      if (room.createConstructionSite(...spawnPos, STRUCTURE_SPAWN) === OK) {
        console.log(`[${Game.time.toLocaleString()}] Building spawn at (${spawnPos.join(", ")})`);
        room.visual.text(`🏗️ Building Spawn`, spawnPos[0] + 1, spawnPos[1], {
          align: "left",
          opacity: 0.8
        });
      }
    }

    if (!spawn) {
      return;
    }

    const exits = getExits(room);

    if ((room.controller?.level ?? 0) >= 3) {
      handleBuildingTowers(room, constructionSites, spawn, roomSources);
    }
  });
};
