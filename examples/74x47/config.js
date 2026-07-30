module.exports = {
  top: 'ic_74x47', // optional; default is basename of vsrc[0]
  vsrc: ['ic_74x47.v'], // list of Verilog/SystemVerilog source files
  // include: ['../common.vh'], // optional; list of Verilog include files
  clock: { mhz: 48, use_pll: true }, // optional; default 48 MHz PLL
  // doNotCheckForChanges: true,
  ports: {
    bcd:   {type: 'input',  width: 4, pins: ['d0', 'd1', 'd2', 'd3']},
    lt_n:  {type: 'input',  width: 1, pins: ['d4']},
    rbi_n: {type: 'input',  width: 1, pins: ['d5']},
    bi_n:  {type: 'input',  width: 1, pins: ['d6']},
    rbo_n: {type: 'output', width: 1, pins: ['c7']},
    seg_n: {type: 'output', width: 7, pins: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']}
  }
};
