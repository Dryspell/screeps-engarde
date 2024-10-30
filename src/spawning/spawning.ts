import { isValidRole, ROLES } from "creepBehavior/roles";
import { generateBody } from "./utils";

const bodyCost = (body: BodyPartConstant[]) => body.reduce((acc, part) => acc + BODYPART_COST[part], 0);

export const nameCreep = (role: string) => `${role}${Game.time}`;

const energyProduction = (room: Room, creeps: Creep[]) => {
  const sources = room.find(FIND_SOURCES);
  const regenerationTime = 300; //sources.reduce((acc, source) => acc + source.ticksToRegeneration, 0);
  const workParts = creeps.reduce((acc, creep) => acc + creep.getActiveBodyparts(WORK), 0);

  const energyPotential = sources.length * 3000;
  const production = workParts * regenerationTime;

  return [production, energyPotential] as [production: number, energyPotential: number];
};

const minerSpawnCondition = (room: Room, hasUnoccupiedMinerPositions: boolean) => {
  return room.energyAvailable >= bodyCost([MOVE, WORK, WORK]) && hasUnoccupiedMinerPositions;
};

const laborerSpawnCondition = (room: Room, creeps: Creep[]) => {
  const laborersInRoom = creeps.filter(creep => creep.memory.role === "laborer");
  return (
    (Memory.rooms[room.name].minerPositions?.length &&
      laborersInRoom.length < Memory.rooms[room.name].minerPositions?.length) ||
    laborersInRoom.length < 1
  );
};

export const handleSpawning = (spawns: StructureSpawn[], creeps: Creep[], hasUnoccupiedMinerPositions: boolean) => {
  const sortedRoles = Object.entries(ROLES).sort(
    ([roleA, _A], [roleB, _B]) =>
      creeps.filter(creep => creep.memory.role === roleA).length -
      creeps.filter(creep => creep.memory.role === roleB).length
  );

  spawns.forEach(spawn => {
    if (spawn.spawning) {
      const spawningCreep = Game.creeps[spawn.spawning.name];
      spawn.room.visual.text("🛠️" + spawningCreep.memory.role, spawn.pos.x + 1, spawn.pos.y, {
        align: "left",
        opacity: 0.8
      });
      return;
    }

    const [production, energyPotential] = energyProduction(spawn.room, creeps);

    Game.time % 20 === 0 &&
      console.log(
        `[${Game.time.toLocaleString()}] Room ${spawn.room.name} Energy Production: ${production}/${energyPotential}`
      );

    for (const entry of sortedRoles) {
      const [roleName, role] = entry;
      if (!isValidRole(roleName)) {
        console.log(
          `[${Game.time.toLocaleString()}] Room ${
            spawn.room.name
          } Received instruction to spawn invalid role: ${roleName} `
        );
        continue;
      }

      if (roleName === "miner" && !minerSpawnCondition(spawn.room, hasUnoccupiedMinerPositions)) {
        continue;
      }

      if (roleName === "laborer" && !laborerSpawnCondition(spawn.room, creeps)) {
        continue;
      }

      const creepsOfRole = creeps.filter(creep => creep.memory.role === roleName);

      const [production, energyPotential] = energyProduction(spawn.room, creepsOfRole);

      const newBody = "body" in role ? generateBody(spawn.room.energyAvailable, role.body) : role.generateBody(spawn);

      const bestBody =
        "body" in role ? generateBody(spawn.room.energyCapacityAvailable, role.body) : role.generateBody(spawn);

      if (creepsOfRole.length && newBody.length < Math.min(production / energyPotential, 1) * bestBody.length) {
        continue;
      }

      if (
        spawn.spawnCreep(newBody, nameCreep(roleName), {
          memory: { role: roleName, room: spawn.room.name, spawn: spawn.name }
        }) === OK
      ) {
        console.log(
          `[${Game.time.toLocaleString()}] Room ${
            spawn.room.name
          } (${roleName}) Energy Production: ${production}/${energyPotential}`
        );
        console.log(
          `[${Game.time.toLocaleString()}] Room ${spawn.room.name}: Spawning new ${roleName} with body: [${newBody.join(
            ", "
          )}]`
        );
        return;
      }
    }
  });
};
