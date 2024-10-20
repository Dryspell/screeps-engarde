import { builderTick } from "creepBehavior/builder";
import { claimerTick } from "creepBehavior/claimer";
import { harvesterTick } from "creepBehavior/harvester";
import { upgraderTick } from "creepBehavior/upgrader";

export const ROLES = {
  harvester: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 4,
    tick: harvesterTick,
    spawnCondition: (room: Room) => true
  },
  upgrader: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 3,
    tick: upgraderTick,
    spawnCondition: (room: Room) => room.controller && room.controller?.level < 8
  },
  builder: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 6,
    tick: builderTick,
    spawnCondition: (room: Room) =>
      Object.values(Game.rooms).some(
        room => room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 || room.find(FIND_MY_SPAWNS).length === 0
      )
  },
  claimer: {
    body: [CLAIM, MOVE] satisfies BodyPartConstant[],
    max: 1,
    tick: claimerTick,
    spawnCondition: (room: Room) => room.energyAvailable >= 650 && Object.keys(Game.rooms).length < Game.gcl.level
  }
} as const;

export const isValidRole = (role: string): role is keyof typeof ROLES => {
  return role in ROLES;
};
