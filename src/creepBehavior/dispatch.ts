import { ROLES } from "creepBehavior/roles";
import { distance2, kmeans } from "spatial/spatial-utils";
import { cachePath, EnergyTarget, TransferTarget } from "creepBehavior/utils";
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
    transferTargets: TransferTarget[]
  ) => {
    const useKmeans = true; //Game.time % 5; //true;

    if (!useKmeans) {
      creeps.forEach(creep => {
        const sortedTransferTargets = transferTargets
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, creep)
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

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
          sortedTransferTargets
        );
      });
    } else {
      const { harvesting, nonHarvesting } = creeps.reduce(
        (acc, creep) => {
          if (creep.memory.state === "harvesting") {
            acc.harvesting.push(creep);
          } else {
            acc.nonHarvesting.push(creep);
          }
          return acc;
        },
        { harvesting: [] as Creep[], nonHarvesting: [] as Creep[] }
      );

      nonHarvesting.forEach(creep => {
        const sortedTransferTargets = transferTargets
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, creep)
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

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
          sortedTransferTargets
        );
      });

      const creepClusters = kmeans(energyTargets.length, harvesting).filter(c => c.cluster.length);

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
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, sbc.creepCluster?.centroid ?? { pos: { x: 25, y: 25 } })
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

        sbc.creepCluster &&
          room.visual.line(
            sbc.creepCluster.centroid.pos.x,
            sbc.creepCluster.centroid.pos.y,
            sbc.energyTarget.base.pos.x,
            sbc.energyTarget.base.pos.y,
            {
              color: colors[sbc.creepCluster?.cluster.length ?? 0]
            }
          );

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
  "creeps.behavior.dispatchByEnergySource"
);
