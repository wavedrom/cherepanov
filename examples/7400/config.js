module.exports = {
    top: 'top',
    vsrc: ['top.v'],
    ports: {
        pd4: { type: 'input',  width: 1, pins: ['d4'] },
        pd5: { type: 'input',  width: 1, pins: ['d5'] },
        pd6: { type: 'output', width: 1, pins: ['d6'] },
        pd7: { type: 'input',  width: 1, pins: ['d7'] },
        pa1: { type: 'input',  width: 1, pins: ['a1'] },
        pa2: { type: 'output', width: 1, pins: ['a2'] },
        pc2: { type: 'output', width: 1, pins: ['c2'] },
        pc3: { type: 'input',  width: 1, pins: ['c3'] },
        pc4: { type: 'input',  width: 1, pins: ['c4'] },
        pc5: { type: 'output', width: 1, pins: ['c5'] },
        pc6: { type: 'input',  width: 1, pins: ['c6'] },
        pc7: { type: 'input',  width: 1, pins: ['c7'] },
    }
};
