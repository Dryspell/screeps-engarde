// Usage:
// At top of main: import MemHack from './MemHack'
// At top of loop(): MemHack.pretick()
// Thats it!
const MemHack = {
  memory: null,
  parseTime: -1,
  register() {
    const start = Game.cpu.getUsed();
    // @ts-ignore
    this.memory = Memory;
    const end = Game.cpu.getUsed();
    this.parseTime = end - start;
    // @ts-ignore
    this.memory = RawMemory._parsed;
  },
  pretick() {
    // @ts-ignore
    delete global.Memory;
    // @ts-ignore
    global.Memory = this.memory;
    // @ts-ignore
    RawMemory._parsed = this.memory;
  }
};
MemHack.register();
export default MemHack;
