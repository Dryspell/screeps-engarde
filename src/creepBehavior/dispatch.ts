import { ROLES } from "creepBehavior/roles";
import { distance2, kmeans } from "spatial/spatial-utils";
import { cachePath, EnergyTarget } from "creepBehavior/utils";
import { colors, visualizeKmeans } from "visual";
import { profileFunction } from "utils/screeps-profiler";

export const dispatchByEnergySource = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
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
  ) => {
    const useKmeans = Game.time % 5; //true;

    if (!useKmeans) {
      creeps.forEach(creep =>
        ROLES[creep.memory.role].tick(
          creep,
          spawns,
          sources,
          constructionSites,
          droppedResources,
          structures,
          ruins,
          tombstones,
          unplannedStructures,
          energyTargets,
          energyTargets,
          [...transferTargets].sort((a, b) => distance2(a, creep) - distance2(b, creep))
        )
      );
    } else {
      const creepClusters = kmeans(energyTargets.length, creeps).filter(c => c.cluster.length);

      if (Memory.visual.kmeans) {
        visualizeKmeans(room, creepClusters, colors);
      }

      const energyTargetsByCluster = energyTargets.map(energyTarget => {
        return {
          energyTarget,
          creepCluster: creepClusters
            .sort((a, b) => cachePath(a.centroid, energyTarget).length - cachePath(b.centroid, energyTarget).length)
            .shift()
        };
      });

      energyTargetsByCluster.forEach(sbc => {
        const sortedTransferTargets = transferTargets
          .map(t => ({ id: t.id, distance: distance2(t, sbc.creepCluster?.centroid ?? { pos: { x: 25, y: 25 } }) }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => Game.getObjectById(t.id) as StructureExtension | StructureSpawn | StructureTower);

        sbc.creepCluster?.cluster.forEach(creep => {
          ROLES[creep.memory.role].tick(
            creep,
            spawns,
            sources,
            constructionSites,
            droppedResources,
            structures,
            ruins,
            tombstones,
            unplannedStructures,
            energyTargets,
            [sbc.energyTarget],
            sortedTransferTargets
          );
        });
      });
    }
  },
  "dispatchByEnergySource"
);
