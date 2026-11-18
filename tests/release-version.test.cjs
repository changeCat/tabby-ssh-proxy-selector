const { test } = require('node:test')
const assert = require('node:assert/strict')
const { releaseTag } = require('../scripts/release-version.cjs')

test('one push takes one patch number from stable Git tags', () => {
    assert.equal(releaseTag([], []), 'v0.0.1')
    const history = ['v0.0.8', 'v0.0.10', 'v0.0.9', 'v1.0.0-beta.1', 'experimental']
    assert.equal(releaseTag(history, []), 'v0.0.11')
    assert.equal(releaseTag(['v0.1.0'], []), 'v0.1.1')
})

test('reruns retain their commit version, including after a later release', () => {
    assert.equal(releaseTag(['v0.1.0', 'v0.1.1'], ['v0.1.0']), 'v0.1.0')
    assert.throws(() => releaseTag(['v0.1.0'], ['v0.1.0'], 'v0.2.0'), /已有版本/)
})

test('manual releases may choose a newer stable tag', () => {
    assert.equal(releaseTag(['v0.1.0'], [], 'v0.2.0'), 'v0.2.0')
    assert.throws(() => releaseTag(['v0.1.0'], [], 'v0.1.0'), /高于/)
    assert.throws(() => releaseTag([], [], 'next'), /格式/)
})
