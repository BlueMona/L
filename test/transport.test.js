const Transport = require('../src/lib/transport');

describe('Transport', () => {
    it('can', () => {
        let t = new Transport(1);
        t.level.should.equal(1);
    })
})