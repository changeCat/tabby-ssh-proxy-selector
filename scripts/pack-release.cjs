const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { zipSync } = require('fflate')
const { name, version } = require('../package.json')

const repo = path.resolve(__dirname, '..')
const archive = `${name}-${version}`
const stage = fs.mkdtempSync(path.join(repo, '.release-'))
const files = {}

function addFile (filename, entry, mode = 0o100644) {
    files[entry] = [fs.readFileSync(filename), { os: 3, attrs: mode << 16 }]
}

try {
    execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--pack-destination', stage], {
        cwd: repo, stdio: 'inherit',
    })
    addFile(path.join(stage, archive + '.tgz'), name + '.tgz')
    addFile(path.join(__dirname, 'install.cmd'), 'install.cmd')
    addFile(path.join(__dirname, 'install.command'), 'install.command', 0o100755)

    const zip = path.join(stage, archive + '.zip')
    fs.writeFileSync(zip, zipSync(files))
    fs.renameSync(zip, path.join(repo, archive + '.zip'))
    console.log(`Created ${archive}.zip`)
} finally {
    fs.rmSync(stage, { recursive: true, force: true })
}
