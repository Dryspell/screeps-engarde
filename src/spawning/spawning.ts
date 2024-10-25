import { isValidRole, ROLES } from "creepBehavior/roles";
import { generateBody } from "./utils";

export const nameCreep = (role: string) => `${role}${Game.time}`;

const energyProduction = (room: Room, creeps: Creep[]) => {
  const sources = room.find(FIND_SOURCES);
  const regenerationTime = 300; //sources.reduce((acc, source) => acc + source.ticksToRegeneration, 0);
  const workParts = creeps.reduce((acc, creep) => acc + creep.getActiveBodyparts(WORK), 0);

  const energyPotential = sources.length * 3000;
  const production = workParts * regenerationTime;

  return [production, energyPotential] as [production: number, energyPotential: number];
};

export const handleSpawning = (spawns: StructureSpawn[], creeps: Creep[]) => {
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

    const creepsInRoom = creeps.filter(creep => creep.room.name === spawn.room.name);

    const [production, energyPotential] = energyProduction(spawn.room, creepsInRoom);

    Game.time % 20 === 0 &&
      console.log(
        `[${Game.time.toLocaleString()}] Room ${spawn.room.name} Energy Production: ${production}/${energyPotential}`
      );

    if (production > 2 * energyPotential) {
      // console.log(`[${Game.time.toLocaleString()}] Room${spawn.room.name} Too much energy production`);
      return;
    }

    //! Having too many creeps in a room is not a good condition to stop spawning, needs more dynamic conditions
    // if (
    //   creeps.filter(creep => creep.room.name === spawn.room.name).length >=
    //   sortedRoles.reduce((acc, [_, { max }]) => acc + max, 0)
    // ) {
    //   // console.log(`[${Game.time.toLocaleString()}] Room ${spawn.room.name} Too many creeps to spawn another`);
    //   return;
    // }

    for (const entry of sortedRoles) {
      const [roleName, role] = entry;
      if (!isValidRole(roleName) || !role.spawnCondition(spawn.room, creeps)) {
        // console.log(
        //   `[${Game.time.toLocaleString()}] Room ${spawn.room.name} Cannot spawn ${roleName} due to spawn condition`
        // );
        continue;
      }

      const creepsOfRole = creepsInRoom.filter(creep => creep.memory.role === roleName);

      const [production, energyPotential] = energyProduction(spawn.room, creepsOfRole);

      const newBody = "body" in role ? generateBody(spawn.room.energyAvailable, role.body) : role.generateBody(spawn);

      const bestBody =
        "body" in role ? generateBody(spawn.room.energyCapacityAvailable, role.body) : role.generateBody(spawn);

      if (creepsOfRole.length && newBody.length < (production / energyPotential) * bestBody.length) {
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
      }
      return;
    }
  });
};
