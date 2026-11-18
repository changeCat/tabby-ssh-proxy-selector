const { execFileSync } = require('node:child_process')
const { appendFileSync } = require('node:fs')

const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function compareTags (a, b) {
    const left = a.slice(1).split('.').map(Number)
    const right = b.slice(1).split('.').map(Number)
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]
}

function releaseTag (tags, tagsAtCommit, requested = '') {
    if (requested && !stableTag.test(requested)) { throw Error('请使用 vX.Y.Z 格式的发布标签') }
    const existing = tagsAtCommit.filter(tag => stableTag.test(tag)).sort(compareTags).at(-1)
    if (existing) {
        if (requested && requested !== existing) { throw Error('该提交已有版本 ' + existing) }
        return existing
    }
    const latest = tags.filter(tag => stableTag.test(tag)).sort(compareTags).at(-1) || 'v0.0.0'
    if (requested) {
        if (compareTags(requested, latest) <= 0) { throw Error('指定版本必须高于 ' + latest) }
        return requested
    }
    const [major, minor, patch] = latest.split('.')
    return [major, minor, Number(patch) + 1].join('.')
}

if (require.main === module) {
    const list = (...args) => execFileSync('git', ['tag', '--list', ...args], { encoding: 'utf8' }).trim().split(/\r?\n/)
    const tag = releaseTag(list(), list('--points-at', 'HEAD'), process.env.REQUESTED_TAG?.trim())
    appendFileSync(process.env.GITHUB_OUTPUT, 'version=' + tag.slice(1) + '\n')
    console.log('发布版本 ' + tag)
}

module.exports = { releaseTag }
