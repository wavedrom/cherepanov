module.exports = {
  top: 'top', // optional; default is basename of vsrc[0]
  vsrc: ['top.sv'], // list of Verilog/SystemVerilog source files
  // include: ['../common.vh'], // optional; list of Verilog include files
  clock: { mhz: 48, use_pll: true }, // optional; default 48 MHz PLL
  ports: {
    a: {type: 'input',  width: 6, pins: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5']},
    y: {type: 'output', width: 6, pins: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']},
  }
};
