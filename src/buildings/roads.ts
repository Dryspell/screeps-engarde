import { flatten } from "lodash";
import { profileFunction } from "utils/screeps-profiler";

export const buildRoads = profileFunction(
  (
    room: Room,
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
  ) => {
    if (constructionSites.filter(site => site.structureType === STRUCTURE_ROAD).length) return;

    for (const memorizedPath of Memory.rooms[room.name].paths) {
      if (memorizedPath.constructedRoad) continue;

      const omitEnd = true;
      const roadResults = memorizedPath.path.map((pathStep, i, path) => {
        if (i < (omitEnd ? path.length - 1 : path.length)) {
          return room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
        } else return OK;
      });
      if (roadResults.every(result => result === OK || result === ERR_INVALID_TARGET)) {
        memorizedPath.constructedRoad = true;
        break;
      } else {
        // console.log(
        //   `[${Game.time.toLocaleString()}] Error building roads to source ${memorizedPath.targetId}, errors: ${roadResults
        //     .filter(Boolean)
        //     .join(", ")}`
        // );
        continue;
      }
    }
  },
  "architect.roads.build"
);

export const getPlannedRoadsSteps = profileFunction((room: Room) => {
  return flatten(Memory.rooms[room.name].paths.map(memorizedPath => memorizedPath.path));
}, "getPlannedRoadsSteps");
