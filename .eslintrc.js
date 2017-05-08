module.exports = {
    root: true,
    parser: 'babel-eslint',
    extends: [
        'peerio'
    ],
    rules: {
        'no-labels': 0,
        'no-mixed-operators': 0,
        'no-multi-assign': 0,
        'no-restricted-properties': 1,
        'no-void': 0
    },
    globals: {
        before: true,
        beforeEach: true,
        after: true,
        afterEach: true
    }
};
