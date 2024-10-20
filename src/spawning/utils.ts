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
    spawnCondition: (room: Room) => true
    // room.find(FIND_CONSTRUCTION_SITES).length > 0
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

// const BODYPART_COST = {
//         "move": 50,
//         "work": 100,
//         "attack": 80,
//         "carry": 50,
//         "heal": 250,
//         "ranged_attack": 150,
//         "tough": 10,
//         "claim": 600
//     };

export const generateBody = (energy: number, body: BodyPartConstant[]) => {
  let availableEnergy = energy;
  if (availableEnergy < body.reduce((acc, part) => acc + BODYPART_COST[part], 0)) {
    return body;
  }
  const bodyParts = [] as BodyPartConstant[];
  const cheapestPart = body.sort((a, b) => BODYPART_COST[a] - BODYPART_COST[b])[0];

  while (availableEnergy >= BODYPART_COST[cheapestPart]) {
    for (const part of body) {
      if (BODYPART_COST[part] > availableEnergy) {
        continue;
      }
      bodyParts.push(part);
      availableEnergy -= BODYPART_COST[part];
    }
  }
  return bodyParts;
};
