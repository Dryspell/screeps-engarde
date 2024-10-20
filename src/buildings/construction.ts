import { handleBuildingTowers } from "./towers";
import { buildRoadFromPosToSet, getExits, MAX_ROOM_EXTENSIONS } from "./utils";

export const handleBuilding = (controlledRooms: Room[]) => {
  controlledRooms.forEach(room => {
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

    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[];

    if ((room.controller?.level ?? 0) >= 3) {
      handleBuildingTowers(room, constructionSites, spawn, roomSources);
    }

    let roadConstructionSitesCount = constructionSites.filter(site => site.structureType === STRUCTURE_ROAD).length;

    // Build roads to Energy Sources
    // if (roadConstructionSitesCount < 2) {
    roadConstructionSitesCount += buildRoadFromPosToSet(
      room,
      spawn.pos,
      roomSources.map(source => source.pos)
    );
    // }

    // Build roads to controller
    if (
      // roadConstructionSitesCount < 2 &&
      room.controller
    ) {
      roadConstructionSitesCount += buildRoadFromPosToSet(
        room,
        room.controller.pos,
        roomSources.map(source => source.pos)
      );
    }

    // Build roads to exits
    // if (roadConstructionSitesCount < 2) {
    const closest = exits
      .map(({ exitDirection }) => spawn.pos.findClosestByPath(room.find(exitDirection)))
      .filter(Boolean) as RoomPosition[];

    roadConstructionSitesCount += buildRoadFromPosToSet(room, spawn.pos, closest, false);
    // }

    // Build extensions around the spawn if there are less than MAX_ROOM_EXTENSIONS
    if (
      room.controller &&
      room.controller.level >= 2 &&
      !constructionSites.some(site => site.structureType === STRUCTURE_EXTENSION) &&
      extensions.length < MAX_ROOM_EXTENSIONS[room.controller.level as keyof typeof MAX_ROOM_EXTENSIONS]
    ) {
      const roomExtensionSpace = Math.ceil(
        Math.sqrt(MAX_ROOM_EXTENSIONS[room.controller.level as keyof typeof MAX_ROOM_EXTENSIONS])
      );

      const spaceAroundSpawn = Array.from({ length: roomExtensionSpace ** 2 }, (_, i) => i).map(i => {
        const x = spawn.pos.x + (i % roomExtensionSpace) - 1;
        const y = spawn.pos.y + Math.floor(i / roomExtensionSpace) - 1;
        return [x, y] as [x: number, y: number];
      });

      const structuresAroundSpawn = room.lookForAtArea(
        LOOK_STRUCTURES,
        spawn.pos.y - Math.floor(roomExtensionSpace / 2),
        spawn.pos.x - Math.floor(roomExtensionSpace / 2),
        spawn.pos.y + Math.floor(roomExtensionSpace / 2),
        spawn.pos.x + Math.floor(roomExtensionSpace / 2),
        true
      );

      const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
        ([x, y]) =>
          !structuresAroundSpawn.some(lookObject => lookObject.structure && lookObject.x === x && lookObject.y === y) &&
          !constructionSites.some(site => site.pos.x === x && site.pos.y === y)
      );

      for (const site of freeSpaceAroundSpawn) {
        if (room.createConstructionSite(...site, STRUCTURE_EXTENSION) !== OK) {
          continue;
        }

        console.log(
          `[${Game.time.toLocaleString()}] Building extension at ${freeSpaceAroundSpawn[0][0]}, ${
            freeSpaceAroundSpawn[0][1]
          }`
        );
        room.visual.text(`🏗️ Building Extension`, freeSpaceAroundSpawn[0][0] + 1, freeSpaceAroundSpawn[0][1], {
          align: "left",
          opacity: 0.8
        });
        break;
      }
    }
  });
};
