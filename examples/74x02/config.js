module.exports = {
    top: 'top',
    vsrc: ['top.v'],
    ports: {
        a: { type: 'input',  width: 4, pins: ['d4', 'd7', 'c4', 'c7'] },
        b: { type: 'input',  width: 4, pins: ['d5', 'a1', 'c3', 'c6'] },
        y: { type: 'output', width: 4, pins: ['d6', 'a2', 'c2', 'c5'] },
    }
};
