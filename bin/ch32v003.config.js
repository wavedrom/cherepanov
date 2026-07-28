// Port mapping config for the CH32V003 (ch32fun) target.
// Loaded by bin/cli.js to map Verilog ports to physical GPIO pins.
//
// Two port styles are supported (auto-detected from the port declaration):
//
//   scalar: width 1, name `p<port><pin>` e.g. `pd4`
//       one Verilog port == one physical pin; the uppercase ch32fun macro
//       (PD4) is used at the GPIO call sites.
//
//   vector: width 8, name `[io]<port>` e.g. `ic`, `od`
//       one Verilog port == all 8 pins of a GPIO port; bit indexing in the
//       Verilog (ic[7], od[6]) selects individual pins. The second letter
//       names the GPIO port. Verilator lowers partial output assigns to
//       read-modify-write, so the generator preserves un-driven bits.
module.exports = {
    // Map a lowercase Verilog port-letter to the uppercase GPIO port used in
    // the ch32fun pin macros (PA1, PC0, PD7, ...).
    gpioPorts: { a: 'A', b: 'B', c: 'C', d: 'D' },

    // Physical pins that exist on the CH32V003 package (ch32v003hw.h macros).
    // Port A only exposes PA1/PA2; ports C and D expose all 8. The generator
    // only emits setup/read/write for pins listed here, and rejects designs
    // that actually use a missing pin (detected via the eval body's bits).
    pinsByPort: {
        A: [1, 2],                       // PA1, PA2
        B: [],                           // not bonded out on F4P6
        C: [0, 1, 2, 3, 4, 5, 6, 7],    // PC0..PC7
        D: [0, 1, 2, 3, 4, 5, 6, 7],    // PD0..PD7
    },

    // ch32fun GPIO API names used in the generated main.c.
    api: {
        include: 'ch32fun.h',
        initAll: 'funGpioInitAll',
        pinMode: 'funPinMode',
        digitalRead: 'funDigitalRead',
        digitalWrite: 'funDigitalWrite',
        systemInit: 'SystemInit',
        inputMode: 'FUN_INPUT',
        outputMode: 'FUN_OUTPUT',
        high: 'FUN_HIGH',
        low: 'FUN_LOW',
    },
};
