import { memorizeRoom } from "memorizeRoom";

const createRoadsForPaths = (room: Room) => {
  Memory.rooms[room.name].spawns.forEach(spawn => {
    spawn.pathsToSources.forEach(pathToSource => {
      if (pathToSource.constructedRoad) return;

      pathToSource.path.forEach((pathStep, i, path) => {
        if (i < path.length - 1) {
          room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
        }
      });
      pathToSource.constructedRoad = true;
    });

    if (spawn.pathToController) {
      if (spawn.pathToController.constructedRoad) return;

      spawn.pathToController.path.forEach((pathStep, i, path) => {
        if (i < path.length - 1) {
          room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
        }
      });
      spawn.pathToController.constructedRoad = true;
    }

    spawn.pathsToMinerals.forEach(pathToMineral => {
      if (pathToMineral.constructedRoad) return;

      pathToMineral.path.forEach((pathStep, i, path) => {
        if (i < path.length - 1) {
          room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
        }
      });
      pathToMineral.constructedRoad = true;
    });

    spawn.pathsToExits.forEach(pathToExit => {
      if (pathToExit.constructedRoad) return;

      pathToExit.path?.forEach((pathStep, i, path) => {
        if (i < path.length - 1) {
          room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
        }
      });
      pathToExit.constructedRoad = true;
    });
  });
};

export const architectRoom = (room: Room) => {
  memorizeRoom(room);

  createRoadsForPaths(room);
};
