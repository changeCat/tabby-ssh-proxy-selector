const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { name, version } = require('../package.json')

const windows = process.platform === 'win32'
assert.ok(windows || process.platform === 'darwin', 'Run on Windows or macOS')
const archive = path.resolve(__dirname, '..', `${name}-${version}.zip`)
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tabby install test-'))
try {
    const release = path.join(scratch, 'release')
    const home = path.join(scratch, 'user home')
    const appData = windows ? path.join(home, 'AppData', 'Roaming') : path.join(home, 'Library', 'Application Support')
    const data = path.join(appData, 'tabby')
    const target = path.join(data, 'plugins', 'node_modules', name)
    const options = { cwd: release, env: { ...process.env, HOME: home, APPDATA: appData }, encoding: 'utf8' }
    fs.mkdirSync(release)
    execFileSync('tar', ['-xf', archive, '-C', release])
    const install = () => windows
        ? execFileSync('cmd.exe', ['/d', '/c', 'install.cmd'], options)
        : execFileSync('./install.command', [], options)

    install()
    const manifest = require(path.join(target, 'package.json'))
    assert.equal(manifest.version, version)
    assert.ok(manifest.keywords.includes('tabby-plugin'))
    assert.ok(fs.existsSync(path.join(target, manifest.main)))
    execFileSync(process.execPath, ['-e', "require('./dist/proxy-socket'); require('./dist/logger').pluginLog('test', 'installed')"], { ...options, cwd: target })
    assert.match(fs.readFileSync(path.join(data, name + '.log'), 'utf8'), /installed/)

    const obsolete = path.join(target, 'obsolete.txt')
    const config = path.join(data, 'config.yaml')
    fs.writeFileSync(obsolete, 'old version')
    fs.writeFileSync(config, 'preserve')
    install()
    assert.ok(!fs.existsSync(obsolete))
    assert.equal(fs.readFileSync(config, 'utf8'), 'preserve')

    fs.unlinkSync(path.join(release, name, manifest.main))
    const failed = windows
        ? spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'install.ps1'], options)
        : spawnSync('./install.command', [], options)
    assert.equal(failed.error, undefined)
    assert.notEqual(failed.status, 0)
    assert.ok(fs.existsSync(path.join(target, manifest.main)))
    console.log('Passed installation, log location, upgrade and incomplete archive checks.')
} finally {
    fs.rmSync(scratch, { recursive: true, force: true })
}
