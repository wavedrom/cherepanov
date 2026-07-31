#!/usr/bin/env node

// cli.js <config.js|config.json>
//
// Uses Verilator (--cc mode) to lower arbitrary Verilog/SystemVerilog into a
// C++ logic body, then transcribes that body into plain C and wraps it with a
// GPIO bridge (ch32fun) to produce main.c for the CH32V003 target.
//
// The full verilated C++ runtime cannot be used: it requires a hosted
// environment (<thread>, <mutex>, <cmath>...) that does not exist on the
// bare-metal rv32ec target. We therefore only borrow verilator's lowered
// logic (the ___ico_sequent__TOP__0 body) and emit a runtime-free main.c.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Sideband MCU/port-mapping config. Holds the physical pin table and the
// ch32fun GPIO API names so the generator logic stays MCU-agnostic.
const cfg = require('./ch32v003.config.js');

// --- Verilator port macro -> { dir, cType, width } -------------------------
// Mirrors verilated_types.h: CData=u8(1-8b), SData=u16(9-16b), IData=u32(17-32b)...
const PORT_MACROS = {
    IN8: { dir: 'INPUT',  ctype: 'uint8_t'  }, OUT8:  { dir: 'OUTPUT', ctype: 'uint8_t'  }, INOUT8:  { dir: 'INOUT', ctype: 'uint8_t'  },
    IN16:{ dir: 'INPUT',  ctype: 'uint16_t' }, OUT16: { dir: 'OUTPUT', ctype: 'uint16_t' }, INOUT16: { dir: 'INOUT', ctype: 'uint16_t' },
    IN:  { dir: 'INPUT',  ctype: 'uint32_t' }, OUT:   { dir: 'OUTPUT', ctype: 'uint32_t' }, INOUT:   { dir: 'INOUT', ctype: 'uint32_t' },
    IN64:{ dir: 'INPUT',  ctype: 'uint64_t' }, OUT64: { dir: 'OUTPUT', ctype: 'uint64_t' }, INOUT64: { dir: 'INOUT', ctype: 'uint64_t' },
};

// Parse V<top>.h for port declarations: VL_IN8(&PD4,0,0); etc.
const parsePorts = async (hdrPath) => {
    const src = await fs.promises.readFile(hdrPath, 'utf8');
    const re = /VL_(IN8|OUT8|INOUT8|IN16|OUT16|INOUT16|IN|OUT|INOUT|IN64|OUT64|INOUT64)\(&(\w+),\s*(\d+),\s*(\d+)\)/g;
    const ports = [];
    let m;
    while ((m = re.exec(src))) {
        const spec = PORT_MACROS[m[1]];
        const msb = +m[3], lsb = +m[4];
        ports.push({ name: m[2], direction: spec.dir, ctype: spec.ctype, width: msb - lsb + 1, msb, lsb });
    }
    return ports;
};

// --- Extract + translate the verilator eval body ----------------------------
// The logic lives in `void V<top>___024root___ico_sequent__TOP__0(...) { ... }`
// inside one of the generated obj_dir/V<top>___024root__DepSet_*__0.cpp files.
const extractEvalBody = async (objDir, topModule) => {
    const fname = `V${topModule}___024root___ico_sequent__TOP__0`;
    const re = new RegExp(`void\\s+${fname}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
    const candidates = (await fs.promises.readdir(objDir))
        .filter(f => /DepSet_.*__0\.cpp$/.test(f) && !f.includes('Slow'));
    for (const f of candidates) {
        const src = await fs.promises.readFile(path.join(objDir, f), 'utf8');
        const m = src.match(re);
        if (m) {
            const body = translateBody(m[1]);
            const constPools = await extractConstPools(objDir, topModule, body);
            return { body, constPools };
        }
    }
    throw new Error(`Could not find eval body ${fname} in ${objDir}`);
};

// Strip C++ scaffolding and translate to plain C operating on port locals.
const translateBody = (body) => {
    let lines = body.split('\n');
    // Drop runtime/debug scaffolding lines that don't contribute to logic.
    lines = lines.filter(l =>
        !/VL_DEBUG_IF|vlSymsp|auto& vlSelfRef|__restrict|VL_ATTR_UNUSED/.test(l));
    let out = lines.join('\n')
        .replace(/vlSelfRef\./g, '')          // port refs become bare names
        .replace(/\(IData\)/g, '(uint32_t)')  // verilator width casts
        .replace(/\(CData\)/g, '(uint8_t)')
        .replace(/\(SData\)/g, '(uint16_t)')
        .replace(/\(QData\)/g, '(uint64_t)')
        .replace(/\bCData\b/g, 'uint8_t')     // local var decls
        .replace(/\bSData\b/g, 'uint16_t')
        .replace(/\bIData\b/g, 'uint32_t')
        .replace(/\bQData\b/g, 'uint64_t')
        .replace(/__DOT__/g, '_')             // internal signal names
        .replace(/VL_UNLIKELY\(([^)]*)\)/g, '($1)');
    return out.trim();
};

// --- Constant-pool extraction ----------------------------------------------
// Verilator lowers `case` statements (and other wide muxes) into table lookups
// and emits the table data in a SEPARATE file V<top>__ConstPool_<n>.cpp, e.g.:
//   extern const VlUnpacked<CData/*6:0*/, 128> Vtop__ConstPool__TABLE_xxx_0 = {{
//       0x7fU, 0x00U, ...
//   }};
// The eval body only references the symbol; the definition is NOT in the
// DepSet cpp. Without copying it, main.c references an undefined symbol and
// fails to link. We scan the (translated) body for __ConstPool__TABLE refs,
// parse each ConstPool cpp, and transcribe every referenced table to a plain-C
// `static const` array so the lowered body links standalone (no VlUnpacked,
// no verilated runtime).
const CONST_POOL_CTYPE = { CData: 'uint8_t', SData: 'uint16_t', IData: 'uint32_t', QData: 'uint64_t' };

const extractConstPools = async (objDir, topModule, body) => {
    // Symbols referenced in the lowered body, e.g. Vtop__ConstPool__TABLE_h6c3f4e05_0.
    const refRe = /\b(V\w+__ConstPool__TABLE_\w+)\b/g;
    const refs = new Set();
    let m;
    while ((m = refRe.exec(body))) refs.add(m[1]);
    if (!refs.size) return '';
    // ConstPool data lives in V<top>__ConstPool_<n>.cpp (never the Slow split).
    const poolFiles = (await fs.promises.readdir(objDir))
        .filter(f => /__ConstPool_.*\.cpp$/.test(f) && !f.includes('Slow'));
    const out = [];
    for (const f of poolFiles) {
        const src = await fs.promises.readFile(path.join(objDir, f), 'utf8');
        for (const name of refs) {
            // extern const VlUnpacked<CData/*W:H*/, N> NAME = {{ <init> }};
            const re = new RegExp(
                `extern\\s+const\\s+VlUnpacked<\\s*(CData|SData|IData|QData)` +
                `\\/\\*[0-9:]+\\*\\/,\\s*(\\d+)\\s*>\\s+${name}\\s*=\\s*\\{\\{([\\s\\S]*?)\\}\\};`
            );
            const mm = src.match(re);
            if (mm) {
                const ctype = CONST_POOL_CTYPE[mm[1]];
                const count = +mm[2];
                const init = mm[3].trim();
                // VlUnpacked uses double braces {{...}}; a plain C array uses one.
                out.push(`static const ${ctype} ${name}[${count}] = { ${init} };`);
            }
        }
    }
    return out.join('\n');
};

// --- Port mapping ----------------------------------------------------------
// The pin mapping comes exclusively from the sideband config file
// (config.js or config.json) passed as the only CLI argument. Each Verilog
// port maps to an explicit list of physical pins (e.g. ['d4','d7','c4','c7'])
// which may span several GPIO ports. There is no name-based auto-detection.
//
// MCU specifics (which pins exist, the GPIO API names) come from cfg.

// Parse a pin string like 'd4' -> { gpioPort: 'D', bit: 4 }.
const parsePin = (s) => {
    const m = String(s).match(/^([a-d])([0-7])$/i);
    if (!m) throw new Error(`Bad pin specifier "${s}" in config`);
    return { gpioPort: m[1].toUpperCase(), bit: +m[2] };
};

// Resolve a Verilog port to its explicit list of { gpioPort, bit } pins
// from the config's per-port mapping. Validates width and direction.
const resolvePins = (p, portConfig) => {
    const pc = portConfig && portConfig[p.name];
    if (!pc) {
        throw new Error(`Port "${p.name}" has no mapping in config`);
    }
    if (pc.pins.length !== p.width) {
        throw new Error(`config: port "${p.name}" width ${p.width} but ${pc.pins.length} pins listed`);
    }
    const dirOk = (pc.type || '').toUpperCase() === p.direction;
    if (!dirOk) {
        throw new Error(`config: port "${p.name}" type "${pc.type}" disagrees with Verilog direction ${p.direction.toLowerCase()}`);
    }
    return pc.pins.map(parsePin);
};

const pinMacroFor = (gpioPort, bit) => `P${gpioPort}${bit}`;
const pinExists = (gpioPort, bit) => (cfg.pinsByPort[gpioPort] || []).includes(bit);

// --- GPIO bridge generation -------------------------------------------------
// Port state is stored in `port_<name>` (lowercase) to avoid clashing with
// the uppercase ch32fun pin macros, which are used only at GPIO call sites.
const portVar = (name) => `port_${name.toLowerCase()}`;
const pinMacro = (name) => name.toUpperCase();

// ch32fun GPIO port pointer macro: GPIOA, GPIOB, GPIOC, GPIOD.
const gpioPtr = (gpioPort) => `GPIO${gpioPort}`;

const getInPortsUsed = (inputs) => {
    // Group input pins by GPIO port; read INDR once per port, then extract
    // each pin's bit into its verilog port variable at the right position.
    const inPinsByPort = {};
    inputs.forEach(p => p.pins.forEach((pin, i) => {
        (inPinsByPort[pin.gpioPort] = inPinsByPort[pin.gpioPort] || []).push({ port: p, bitIndex: i, pin });
    }));
    return Object.keys(inPinsByPort).sort();
};

const declarePreviousInputs = (inputs, cfg) => cfg.doNotCheckForChanges
    ? '// change detection disabled'
    : getInPortsUsed(inputs)
        .map(p => 'static uint32_t p' + p.toLowerCase() + '_prev;')
        .join('\n');

const readInputs = (inputs, cfg) => {
    // --- read inputs: load each touched GPIO port's INDR once, scatter bits ---
    const inPortsUsed = getInPortsUsed(inputs);

    const readLines = [];
    if (!cfg.doNotCheckForChanges) {
        readLines.push('        uint32_t changed = 0;');
    }

    // one local per touched GPIO port holding its INDR value
    inPortsUsed.forEach(gp => {
        const name = gp.toLowerCase();
        readLines.push(`        uint32_t indr_${name} = ${gpioPtr(gp)}->INDR;`);
        if (!cfg.doNotCheckForChanges) {
            readLines.push(`\
        if (__builtin_expect(indr_${name} != p${name}_prev, 0)) {
            p${name}_prev = indr_${name};
            changed = 1;
        }`);
        }
    });
    if (!cfg.doNotCheckForChanges) {
        readLines.push('        if (__builtin_expect(changed == 0, 1)) continue;');
    }
    for (const p of inputs) {
        const terms = p.pins.map((pin, i) =>
            `            | (uint8_t)(((indr_${pin.gpioPort.toLowerCase()} >> ${pin.bit}U) & 1U) << ${i}U)`);
        readLines.push(`        ${portVar(p.name)} = 0\n${terms.join('\n')}\n            ;`);
    }
    return readLines.join('\n');
};

const generateMainC = (ports, evalBody, topModule, userCfg, constPools) => {
    const A = cfg.api;
    // Attach resolved pins to each port and validate against the package.
    const portsWithPins = ports.map(p => ({ ...p, pins: resolvePins(p, userCfg.ports) }));
    const inputs  = portsWithPins.filter(p => p.direction === 'INPUT');
    const outputs = portsWithPins.filter(p => p.direction === 'OUTPUT');
    const portDecls = portsWithPins.map(p => `static ${p.ctype} ${portVar(p.name)};`).join('\n');

    // Reject designs that touch pins not bonded out on the package.
    const missing = [];
    for (const p of portsWithPins) {
        for (const pin of p.pins) {
            if (!pinExists(pin.gpioPort, pin.bit)) missing.push(`${pin.gpioPort}${pin.bit}`);
        }
    }
    if (missing.length) {
        throw new Error(`Design uses pins not available on the target package: ${missing.join(', ')}`);
    }

    // --- io_init: one funPinMode per physical pin ---
    // Outputs -> push-pull output; all other (non-output) pins -> floating
    // input (FUN_INPUT == GPIO_CNF_IN_FLOATING, no pull-up/down). Making non-
    // output pins floating inputs disables their output driver, so a later
    // blind OUTDR write to the port won't drive those pins externally.
    const seenPins = new Set();
    const initLines = [];
    for (const p of portsWithPins) {
        const mode = p.direction === 'OUTPUT' ? A.outputMode : A.inputMode;
        for (const pin of p.pins) {
            const key = `${pin.gpioPort}${pin.bit}`;
            if (seenPins.has(key)) continue;
            seenPins.add(key);
            initLines.push(`    ${A.pinMode}(${pinMacroFor(pin.gpioPort, pin.bit)}, ${mode});`);
        }
    }
    const initPins = initLines.join('\n');

    // --- write outputs: one OUTDR store per touched GPIO port ---
    // Non-output pins are configured as floating inputs (output driver off),
    // so writing their OUTDR latch bit is harmless -- the pin isn't driven.
    // We can therefore build a full 8-bit port word by ORing each output
    // pin's value into its bit position and store it with a single OUTDR
    // write, avoiding BSHR's set/reset split (no per-pin `^1U` arithmetic).
    const outPinsByPort = {};
    outputs.forEach(p => p.pins.forEach((pin, i) => {
        (outPinsByPort[pin.gpioPort] = outPinsByPort[pin.gpioPort] || []).push({ port: p, bitIndex: i, pin });
    }));
    const writeLines = [];
    for (const gp of Object.keys(outPinsByPort).sort()) {
        const terms = [];
        for (const { port, bitIndex, pin } of outPinsByPort[gp]) {
            const v = `(${portVar(port.name)} >> ${bitIndex}U) & 1U`;
            terms.push(`            | ((uint32_t)(${v}) << ${pin.bit}U)`);
        }
        writeLines.push(`        ${gpioPtr(gp)}->OUTDR = 0\n${terms.join('\n')}\n            ;`);
    }
    const writeOutputs = writeLines.join('\n') || '    /* no driven output bits */';

    const pinComment = portsWithPins.map(p => {
        const pinList = p.pins.map(pin => pinMacroFor(pin.gpioPort, pin.bit)).join(', ');
        return `//   ${p.name} [${p.width}b] ${p.direction.toLowerCase()} -> ${pinList}`;
    }).join('\n');

    // Rewrite bare port references in the lowered eval body to storage names.
    // Ports are whole-word identifiers; sort longest-first to avoid prefix
    // clashes (e.g. a vs ab). Internal signals keep their translated names.
    const sorted = [...portsWithPins].sort((a, b) => b.name.length - a.name.length);
    let body = evalBody;
    for (const p of sorted) {
        body = body.replace(new RegExp(`\\b${p.name}\\b`, 'g'), portVar(p.name));
    }

    return `\
#include "${A.include}"

// Auto-generated from module ${topModule} by bin/cli.js. Do not edit by hand.
// Verilator --cc lowered the logic; the verilated C++ runtime
// is NOT used (it is hosted-only and will not build for rv32ec).
//
// Port / pin map:
${pinComment}

${portDecls}

${declarePreviousInputs(inputs, userCfg)}
${constPools ? '\n' + constPools + '\n' : ''}
// Verilator-lowered logic (translated from
// V${topModule}___024root___ico_sequent__TOP__0).
static inline void eval(void) {
${body}
}

static void io_init(void) {
    ${A.initAll}();
${initPins}
}

int main(void) {
    ${A.systemInit}();
    io_init();
    while (1/*loop*/) {
        // read inputs
${readInputs(inputs, userCfg)}
        // evaluate logic
        eval();
        // write outputs
${writeOutputs}
    }
}
`;
};

// --- Driver -----------------------------------------------------------------
// Usage: cli.js <config.js|config.json>
//
// The config file is the only argument and fully describes the build:
//   {
//     top:   'top',                 // optional; default = basename of vsrc[0]
//     vsrc:  ['top.sv'],            // Verilog/SystemVerilog source files
//     include: ['../common.vh'],    // optional; Verilog include files
//     clock: { mhz: 48, use_pll: true },  // optional; default 48 MHz PLL
//     ports: { a: {type:'input', width:8, pins:['d4',...]}, ... }
//   }
const loadConfig = async (configPath) => {
    const abs = path.resolve(configPath);
    if (/\.json$/i.test(abs)) {
        const txt = await fs.promises.readFile(abs, 'utf8');
        return JSON.parse(txt);
    }
    return require(abs);
};

// --- funconfig.h + Makefile generation -------------------------------------
const generateFunconfigH = (clock) => {
    const mhz = clock.mhz;
    const usePll = clock.use_pll !== false; // default true
    return `\
#ifndef _FUNCONFIG_H
#define _FUNCONFIG_H

// Auto-generated by bin/cli.js. Do not edit by hand.
#define FUNCONF_USE_PLL ${usePll ? 1 : 0}
#define FUNCONF_SYSTEM_CORE_CLOCK ${mhz * 1000000}

#endif
`;
};

const generateMakefile = (cliPath, ch32funPath) => {
    return `\
# Auto-generated by bin/cli.js. Do not edit by hand.
all : flash

TARGET:=main

TARGET_MCU?=CH32V003
CH32FUN?=${ch32funPath}
EXTRA_CFLAGS?=-O3
include $(CH32FUN)/ch32fun.mk

create:
\t${cliPath} config.js

cleanall: clean
\trm -rf obj_dir main.c

flash : cv_flash
clean : cv_clean
`;
};

// --- .lst parsing + timing analysis ----------------------------------------
// IC-timing-style model with a fast/slow dual path.
//
// Change-detection gives the loop two execution paths:
//   * fast path  -- no input changed: read each input port's INDR, compare to
//     its saved previous value, `continue`. Skips eval + OUTDR writes.
//   * slow path  -- some input changed: read INDRs, detect change, run eval,
//     write OUTDRs, loop back. Counted from the full loop body in main.lst.
//
// While inputs are idle every iteration runs the fast path, so the loop polls
// at 1/Tfast. An edge arriving at a random phase waits uniform[0, Tfast] for
// the next INDR read (mean Tfast/2), then the detecting slow-path iteration
// spends its read->write span Tslow to drive OUTDR. Analogous to a clocked FF
// + combinational logic:
//   Tdelay  = Tslow + Tfast/2     (mean input->output delay)
//   Tjitter = +-Tfast/2           (aperture jitter -- the only variable term)
// With change-detection off, Tfast = Tslow = T -> Tdelay = 1.5T, Tjitter =
// +-0.5T (the oscilloscope-validated single-path model).
//
// Per-path costs (calibrated against oscilloscope):
//   Tfast = instrs_fast / f + mmio_fast * 0.05us
//     The idle poll's one branch is always taken the same way (no mispredict
//     bubble, no +1.6); it only does INDR reads (~0.05us each). Pinned by the
//     74x04 jitter: 3 input ports -> Tfast = 0.36us @ 48 MHz (Tjitter = +-0.18us).
//   Tslow = (instrs_slow + 1.6) / f + mmio_slow * 0.1us
//     +1.6 taken-back-edge bubble; OUTDR writes pay the full AHB->APB bridge
//     floor (0.1us). Pinned by 8 instrs + 1.6 = 9.6 cyc = 0.4us @ 48 MHz,
//     0.6us @ 24 MHz.
//
// The fast path is estimated from numInPorts (stable, known at generation
// time) as 3*P+1 instrs + P INDR reads, rather than parsed out of the heavily
// rotated/interleaved disassembly. The .lst is objdump -S output; with -flto
// sim_step/eval/io_init inline into main, so we anchor the loop on the first
// "->INDR" annotation, recover the full body extent from the lowest back-edge
// target, and count instructions + MMIO over that range.
const analyzeLst = (lstText, numInPorts, checkForChanges) => {
    const lines = lstText.split('\n');
    const disasmRe = /^\s+([0-9a-f]+):\s+/;
    const addrOf = (i) => parseInt(lines[i].match(disasmRe)[1], 16);
    const isDisasm = (i) => i >= 0 && i < lines.length && disasmRe.test(lines[i]);

    // First disassembly line at or after a source annotation line.
    const firstDisasmAfter = (annoRe) => {
        for (let i = 0; i < lines.length; i++) {
            if (annoRe.test(lines[i]) && !disasmRe.test(lines[i])) {
                for (let j = i + 1; j < lines.length; j++) {
                    if (disasmRe.test(lines[j])) return j;
                }
            }
        }
        return -1;
    };

    // GPIO base registers (A=0x40010800, B=..C00, C=..1000, D=..1400) are set
    // up before the loop; track them across the whole function so MMIO counts
    // can resolve lw/sw bases, including addi-derived pointers (e.g. GPIOD from
    // GPIOC -- all share the upper 16 bits 0x4001).
    const gpioRegs = new Set();
    for (const l of lines) {
        const m = l.match(/^\s+[0-9a-f]+:\s+[0-9a-f]+\s+lui\s+(\w+),0x4001[0-9a-f]/i);
        if (m) gpioRegs.add(m[1]);
    }
    for (const l of lines) {
        const m = l.match(/^\s+[0-9a-f]+:\s+[0-9a-f]+\s+addi\s+(\w+),(\w+),/i);
        if (m && gpioRegs.has(m[2])) {
            const cmt = l.match(/#\s*([0-9a-f]{8,})/);
            if (cmt) {
                const val = parseInt(cmt[1], 16);
                if ((val & 0xffff0000) === 0x40010000) gpioRegs.add(m[1]);
            } else {
                gpioRegs.add(m[1]);
            }
        }
    }
    // MMIO access: lw/sw with offset 8 (INDR read) or 12 (OUTDR write) on a
    // register holding a GPIO base address.
    const isMmio = (l) => {
        const m = l.match(/^\s+[0-9a-f]+:\s+\S+\s+(lw|sw)\s+\w+,\s*(\d+)\((\w+)\)/i);
        return m && gpioRegs.has(m[3]) && (parseInt(m[2]) === 8 || parseInt(m[2]) === 12);
    };
    const countRange = (a, b) => {
        let instructions = 0, mmio = 0;
        for (let i = a; i <= b; i++) {
            if (!disasmRe.test(lines[i])) continue;
            instructions++;
            if (isMmio(lines[i])) mmio++;
        }
        return { instructions, mmio };
    };

    // Loop body anchor: the first `->INDR` source annotation (may land mid-loop
    // due to load rotation; the true extent is recovered below).
    let loopStartIdx = firstDisasmAfter(/->\s*INDR/);
    if (loopStartIdx < 0) return null;

    // Back-edges: every backward unconditional jump (j/jal) at or after the
    // loop start. Stop at the next function label so an IRQ handler's
    // `1: j 1b` isn't mistaken for a loop back-edge. With change-detection the
    // compiler may emit two back-edges (fast-path into the prologue, slow-path
    // into eval); the full body spans the lowest target to the last back-edge.
    const jumpRe = /^\s+([0-9a-f]+):\s+\S+\s+(j|jal)\s+([0-9a-f]+)\b/i;
    const funcLabelRe = /^[0-9a-f]+\s+<.*>:/;
    const backEdges = [];
    for (let i = loopStartIdx; i < lines.length; i++) {
        if (funcLabelRe.test(lines[i]) && i > loopStartIdx) break;
        if (!disasmRe.test(lines[i])) continue;
        const m = lines[i].match(jumpRe);
        if (!m) continue;
        const target = parseInt(m[3], 16);
        if (target > addrOf(i)) continue;
        for (let k = i; k >= 0; k--) {
            if (isDisasm(k) && addrOf(k) === target) {
                backEdges.push({ idx: i, targetIdx: k });
                break;
            }
        }
    }
    if (!backEdges.length) return null;

    // Loop top = lowest back-edge target; extend the body start down to it so
    // the whole loop (including any rotated prologue tail) is covered.
    const loopTopIdx = backEdges.reduce((lo, be) =>
        (be.targetIdx < lo ? be.targetIdx : lo), backEdges[0].targetIdx);
    if (addrOf(loopTopIdx) < addrOf(loopStartIdx)) loopStartIdx = loopTopIdx;
    const backEdgeIdx = backEdges[backEdges.length - 1].idx;

    // Slow path = the full loop body (INDR reads + eval + OUTDR writes).
    const slow = countRange(loopStartIdx, backEdgeIdx);
    if (!slow.instructions) return null;

    // Fast path: estimated from the input GPIO port count -- 3 instrs/port
    // (INDR load + compare + prev-save) + 1 loop-tail shuffle, 1 INDR/port.
    // With change-detection off the loop is a single path, so fast == slow.
    if (checkForChanges && numInPorts > 0) {
        return { fast: { instructions: 3 * numInPorts + 1, mmio: numInPorts },
                 slow, dual: true };
    }
    return { fast: slow, slow, dual: false };
};

const reportTiming = (analysis, clock) => {
    const f = clock.mhz * 1e6;          // Hz
    // Slow path: +1.6 taken-back-edge bubble, 0.1 us/MMIO (OUTDR, AHB->APB).
    const periodSlow = (instrs, mmio) => (instrs + 1.6) / f + mmio * 0.1e-6;
    // Fast path: no branch bubble (idle poll always takes the same way),
    // 0.05 us/MMIO (INDR read, cheaper than OUTDR write).
    const periodFast = (instrs, mmio) => instrs / f + mmio * 0.05e-6;
    const Tfast = analysis.dual
        ? periodFast(analysis.fast.instructions, analysis.fast.mmio)
        : periodSlow(analysis.fast.instructions, analysis.fast.mmio);
    const Tslow = periodSlow(analysis.slow.instructions, analysis.slow.mmio);
    // See the model comment above analyzeLst for the Tdelay/Tjitter derivation.
    const Tdelay  = Tslow + Tfast / 2;
    const Tjitter = Tfast / 2;
    const us = (sec) => (sec * 1e6).toFixed(2);
    console.log('');
    console.log('Timing analysis');
    console.log('----------------');
    console.log(`  clock:        ${clock.mhz} MHz${clock.use_pll === false ? ' (HSI, no PLL)' : ' (PLL)'}`);
    if (analysis.dual) {
        const sC = analysis.slow.instructions + 1.6;
        console.log(`  fast path:    ${analysis.fast.instructions} instrs, ${analysis.fast.mmio} INDR reads  -> Tfast = ${us(Tfast)} us`);
        console.log(`  slow path:    ${analysis.slow.instructions} instrs +1.6 = ${sC.toFixed(1)} cyc, ${analysis.slow.mmio} MMIO  -> Tslow = ${us(Tslow)} us`);
        console.log(`  Tdelay:       ${us(Tdelay)} us   (Tslow + Tfast/2)`);
        console.log(`  Tjitter:      +-${us(Tjitter)} us   (Tfast/2 aperture)`);
    } else {
        const c = analysis.fast.instructions + 1.6;
        console.log(`  loop:         ${analysis.fast.instructions} instrs +1.6 = ${c.toFixed(1)} cyc, ${analysis.fast.mmio} MMIO accesses`);
        console.log(`  T (loop):     ${us(Tfast)} us`);
        console.log(`  Tdelay:       ${us(Tdelay)} us   (1.5*T)`);
        console.log(`  Tjitter:      +-${us(Tjitter)} us   (T/2 aperture)`);
    }
};

const main = async () => {
    const configPath = process.argv[2];
    if (!configPath) {
        console.error('Usage: cli.js <config.js|config.json>');
        process.exit(1);
    }
    const objDir = 'obj_dir';

    // 0) Load the config file.
    let cfg;
    try {
        cfg = await loadConfig(configPath);
    } catch (e) {
        console.error(`Cannot load config ${configPath}: ${e.message}`);
        process.exit(1);
    }
    if (!cfg.vsrc || !cfg.vsrc.length) {
        console.error(`config: missing or empty "vsrc" (Verilog source list)`);
        process.exit(1);
    }
    if (!cfg.ports) {
        console.error(`config: missing "ports" mapping`);
        process.exit(1);
    }
    // top module name: explicit, else basename of vsrc[0] without .v/.sv
    const topModule = cfg.top || path.basename(cfg.vsrc[0]).replace(/\.(v|sv)$/i, '');
    // resolve vsrc/include paths relative to the config file's directory
    const baseDir = path.dirname(path.resolve(configPath));
    const vsrc = cfg.vsrc.map(f => path.resolve(baseDir, f));
    const include = (cfg.include || []).map(f => path.resolve(baseDir, f));
    // clock config: default 48 MHz with PLL
    const clock = cfg.clock || { mhz: 48, use_pll: true };

    // 1) Run verilator --cc to lower the design. --pins-uint8 keeps every port
    //    1-8 bits wide; --no-timing/--no-trace/--no-coverage keep output small.
    const vltArgs = [
        '--cc', '--pins-uint8', '--no-timing', '--no-trace', '--no-coverage',
        '-CFLAGS', '-fno-exceptions -fno-rtti -fno-threadsafe-statics -Os',
    ];
    for (const inc of include) vltArgs.push(`-I${path.dirname(inc)}`);
    vltArgs.push(...vsrc, '--top-module', topModule);
    try {
        execFileSync('verilator', vltArgs, { stdio: 'inherit' });
    } catch (e) {
        console.error('verilator failed; aborting.');
        process.exit(1);
    }

    // 2) Parse the generated primary header for the port list.
    const ports = await parsePorts(path.join(objDir, `V${topModule}.h`));
    if (!ports.length) {
        console.error(`No top-level ports found in V${topModule}.h`);
        process.exit(1);
    }

    // 3) Extract + translate the lowered eval body to plain C.
    const { body: evalBody, constPools } = await extractEvalBody(objDir, topModule);

    // 4) Emit main.c, funconfig.h, Makefile.
    let mainC;
    try {
        mainC = generateMainC(ports, evalBody, topModule, cfg, constPools);
    } catch (e) {
        console.error(`Cannot generate main.c: ${e.message}`);
        process.exit(1);
    }
    await fs.promises.writeFile('main.c', mainC);
    await fs.promises.writeFile('funconfig.h', generateFunconfigH(clock));
    // ch32fun path: config.js `ch32fun` field > $CH32FUN env > default
    // sibling-repo layout (../ch32fun/ch32fun).
    const ch32funPath = cfg.ch32fun || process.env.CH32FUN || '../ch32fun/ch32fun';
    await fs.promises.writeFile('Makefile', generateMakefile(' ../../bin/cli.js', ch32funPath));
    console.log(`Generated main.c for module ${topModule}: ${ports.length} ports.`);
    console.log(`Generated funconfig.h (${clock.mhz} MHz, PLL ${clock.use_pll !== false ? 'on' : 'off'}), Makefile.`);

    // 5) Build the firmware.
    try {
        execFileSync('make', ['clean'], { stdio: 'inherit' });
        execFileSync('make', ['build'], { stdio: 'inherit' });
    } catch (e) {
        console.error('Build failed; aborting (no timing analysis).');
        process.exit(1);
    }

    // 6) Parse the .lst disassembly and run timing analysis.
    const lstText = await fs.promises.readFile('main.lst', 'utf8');
    // Number of distinct GPIO ports that carry inputs -- drives the fast-path
    // estimate (one INDR read + compare per port). Pins were resolved during
    // generation; recompute the port set from the config + pin specifiers.
    const checkForChanges = !cfg.doNotCheckForChanges;
    const inPorts = new Set();
    for (const p of ports) {
        if (p.direction !== 'INPUT') continue;
        const pc = cfg.ports[p.name];
        if (pc) pc.pins.forEach(s => inPorts.add(parsePin(s).gpioPort));
    }
    const numInPorts = inPorts.size;
    const analysis = analyzeLst(lstText, numInPorts, checkForChanges);
    if (!analysis) {
        console.error('Could not find the hot loop in main.lst; skipping timing analysis.');
        process.exit(0);
    }
    reportTiming(analysis, clock);
};

main();
