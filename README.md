# cherepanov

> The $0.1 PLD you already have in your drawer.

Turn a CH32V003 microcontroller into a tiny reprogrammable glue chip. Write
low-density logic in Verilog or SystemVerilog, feed the source through
`bin/cli.js`, and get a runtime-free C firmware that bit-bangs GPIO to
emulate the circuit -- slower than a real PLD, but cheap and flexible.

## How it works

```
 top.v / top.sv  ──►  Verilator (--cc)  ──►  lowered logic body  ──►  cli.js  ──►  main.c
                         (C++ logic)          (transcribed to C)        (GPIO bridge)
                                                                                  │
                                                                                  ▼
                                                                          riscv64-elf-gcc
                                                                                  │
                                                                                  ▼
                                                                            main.bin  ──►  CH32V003
```

`bin/cli.js <config.js>` is the only entry point. It:

1. Runs Verilator `--cc` to lower the Verilog/SystemVerilog into C++.
2. Extracts the lowered logic body (`___ico_sequent__TOP__0`).
3. Translates that body to plain C (no verilated runtime -- it's hosted-only
   and won't build for the bare-metal `rv32ec` target).
4. Wraps it in a GPIO bridge: reads input pins via `GPIOx->INDR`, evaluates,
   writes output pins via `GPIOx->OUTDR`.
5. Generates `funconfig.h` and `Makefile`, builds the firmware, and runs a
   timing analysis on the disassembly.

## Requirements

* Verilator v5
* [ch32fun](https://github.com/cnlohr/ch32fun) (CH32V003 toolchain + bootloader)
* RISC-V bare-metal toolchain (`riscv64-elf-gcc`)
* Node.js (for `bin/cli.js`)

## Quick start

```
cd examples/74x04
../../bin/cli.js config.js
make flash
```

## Config file

The config file (`.js` or `.json`) is the only argument and fully describes
the build:

```js
module.exports = {
  top:    'top',                   // optional; default = stem of vsrc[0]
  vsrc:   ['top.sv'],              // Verilog/SystemVerilog source files
  // include: ['../common.vh'],    // optional; Verilog include files
  clock:  { mhz: 48, use_pll: true }, // optional; default 48 MHz PLL
  // ch32fun: '../ch32fun/ch32fun',   // optional; path to ch32fun (default: $CH32FUN or ../ch32fun/ch32fun)
  ports: {                         // explicit per-port -> physical pin map
    a: { type: 'input',  width: 6, pins: ['d0','d1','d2','d3','d4','d5'] },
    y: { type: 'output', width: 6, pins: ['c0','c1','c2','c3','d2','d3'] },
  }
};
```

Each pin string (e.g. `'d4'`) maps to a physical GPIO pin (`PD4`). A Verilog
port of arbitrary width maps to an arbitrary list of pins, which may span
several GPIO ports; the generator reads each touched GPIO port's `INDR` once
and writes one `OUTDR` word per touched output port.

Non-output pins are configured as floating inputs (no pull-up/down), which
disables their output driver. This makes a blind full-port `GPIOx->OUTDR`
write safe: output pins get driven, input pins' latch bits update but are
not driven externally.

## Examples

| example | function | source | flash |
|---------|----------|--------|-------|
| `7400` | quad 2-input NAND | `top.v` | 852 B |
| `74x02` | quad 2-input NOR | `top.v` | 828 B |
| `74x04` | hex inverter (6 gates) | `top.sv` | 748 B |

Each example directory has a `config.js`, a Verilog source, and (after
running `cli.js`) a generated `main.c` + `funconfig.h` + `Makefile`.

## CH32V003 pinout

![](assets/CH32V003F4P6_Pinout.jpg)

## Benchmark: 74x04 inverter

Oscillogram of one gate of the 74x04 inverter. Blue line is the input, yellow
line is the output. Loop period T = 0.4 µs; mean input→output delay ≈ 1.5T =
0.6 µs; jitter ≈ ±0.5T = ±0.2 µs.

![](assets/inverter-waveform.jpg)

### Timing model

The polling loop reads `INDR` at the start of each iteration and writes
`OUTDR` at the end, so the read→write span `d ≈ T`. For an input edge arriving
at a random phase relative to the loop:

```
Tfast  = d              ≈ T      (edge just before INDR read)
Tslow  = T + d          ≈ 2T     (edge just after INDR read)
Tmean  = (Tfast+Tslow)/2 = 1.5T
Tjitter = (Tslow-Tfast)/2 = 0.5T
```

The jitter is entirely **sampling (aperture) jitter** -- not interrupt
latency -- and equals `T/2` regardless of where the write sits in the loop.
The only lever on jitter is shortening T.

### Where the time goes

```
T = c/f + m
```

- `c` = CPU cycles (loop instructions + ~1.6 branch overhead)
- `f` = core clock
- `m` = MMIO bridge time (AHB→APB), ~0.1 µs per GPIO access, clock-independent

Two oscilloscope data points pin the model exactly:

| clock | T (measured) | T (model) |
|-------|-------------|-----------|
| 48 MHz (PLL) | 0.4 µs | 0.40 µs |
| 24 MHz (HSI) | 0.6 µs | 0.60 µs |

Solving: `c = 9.6` cycles, `m = 0.2 µs` (2 MMIO). At 48 MHz the loop is
**50% CPU-bound, 50% MMIO-bound** -- the clock is only a half-lever because
the AHB→APB bridge sets a ~0.2 µs floor the PLL can't touch.

For low-density logic the gate eval itself (`~a`, `~(a & b)`, etc.) is a
handful of ALU instructions and is **not** the bottleneck. The dominant cost
is **port remuxing** -- scattering input bits across GPIO ports and gathering
output bits back. With a linear mapping (all inputs on one port, all outputs
on another, identity bit order) the compiler folds the scatter/gather into
two mask instructions and the loop hits the 0.4 µs floor. Pin mappings that
span multiple GPIO ports cost ~3×.

`cli.js` reports the timing analysis automatically after building:

```
Timing analysis
----------------
  clock:        48 MHz (PLL)
  loop:         8 instructions + ~1.6 br overhead = 9.6 cycles, 2 MMIO accesses
  T (loop):     0.40 us
  Tmean:        0.60 us
  Tjitter:      +-0.20 us
```
### openSUSE Tumbleweed

```
sudo zypper install verilator cross-riscv64-elf-gcc16 cross-riscv64-newlib-devel \
                    cross-riscv64-binutils libudev-devel libusb-1_0-devel nodejs
```

## License

See [LICENSE](LICENSE).
