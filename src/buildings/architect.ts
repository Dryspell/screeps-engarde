import { memorizeRoom } from "memorizeRoom";
import { profileFunction } from "utils/screeps-profiler";
import { buildRoads, getPlannedRoadsSteps } from "./roads";
import { planAndBuildTowers } from "./towers";
import { planAndBuildWalls } from "./walls";
import { constructSpawn } from "./spawns";
import { planAndBuildContainers } from "./containers";
import { planAndBuildExtensions } from "./extensions";

export const architectRoom = profileFunction(
  (
    room: Room,
    sources = room.find(FIND_SOURCES),
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    structures = room.find(FIND_STRUCTURES)
  ) => {
    const spawns = structures.filter(structure => structure.structureType === STRUCTURE_SPAWN) as StructureSpawn[];

    const roomController = room.controller;

    memorizeRoom(room, spawns, sources, roomController, structures);

    if (!roomController) {
      return;
    }

    if (
      !spawns.length &&
      room.controller &&
      room.controller.my &&
      !constructionSites.filter(site => site.structureType === STRUCTURE_SPAWN).length &&
      sources.length >= 2
    ) {
      // If there is no spawn and no spawn construction site, create a spawn construction site at the centroid of the sources and controller

      constructSpawn(room, roomController, sources);
      return;
    }

    planAndBuildContainers(room, spawns, constructionSites, structures);

    const plannedRoads = getPlannedRoadsSteps(room);
    planAndBuildTowers(
      room,
      spawns,
      roomController,
      sources,
      constructionSites,
      structures.filter(structure => structure.structureType === STRUCTURE_TOWER) as StructureTower[],
      plannedRoads,
    );

    planAndBuildExtensions(
      room,
      spawns,
      roomController,
      constructionSites,
      structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION) as StructureExtension[],
      plannedRoads
    );

    buildRoads(room, constructionSites);

    planAndBuildWalls(
      room,
      spawns,
      roomController,
      plannedRoads,
      structures,
      structures.filter(
        structure => structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART
      ) as (StructureWall | StructureRampart)[],
      constructionSites
    );
  },
  "architect.architectRoom"
);
