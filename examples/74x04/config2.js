module.exports = {
  top: 'top', // optional; default is basename of vsrc[0]
  vsrc: ['top.sv'], // list of Verilog/SystemVerilog source files
  // include: ['../common.vh'], // optional; list of Verilog include files
  clock: { mhz: 48, use_pll: true }, // optional; default 48 MHz PLL
  // doNotCheckForChanges: true,
  ports: {
    a: {type: 'input',  width: 6, pins: ['d4', 'd6', 'a1', 'd0', 'c2', 'c4', 'c6', 'd3']},
    y: {type: 'output', width: 6, pins: ['d5', 'd7', 'a2', 'c0', 'c1', 'd2', 'c5', 'c3']},
  }
};
