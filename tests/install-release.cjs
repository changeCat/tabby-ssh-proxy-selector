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
    const plugins = path.join(data, 'plugins')
    const modules = path.join(plugins, 'node_modules')
    const target = path.join(modules, name)
    const rootManifest = path.join(plugins, 'package.json')
    const syncName = 'tabby-sync-config'
    const syncSource = path.join(plugins, 'fixtures', syncName)
    const syncSpec = 'file:fixtures/' + syncName
    function manage (...args) {
        const command = ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...args]
        execFileSync(windows ? 'cmd.exe' : 'npm', windows ? ['/d', '/c', 'npm.cmd', ...command] : command, {
            ...options, cwd: plugins, env: { ...options.env, npm_config_cache: path.join(scratch, 'npm-cache') },
        })
    }
    function seedSync () {
        fs.mkdirSync(syncSource, { recursive: true })
        fs.writeFileSync(path.join(syncSource, 'package.json'), JSON.stringify({
            name: syncName, version: '1.2.0', keywords: ['tabby-plugin'], main: 'index.js',
        }))
        fs.writeFileSync(path.join(syncSource, 'index.js'), 'module.exports = "sync fixture"')
        manage(syncSpec)
    }
    function verifyBoth () {
        assert.equal(require(path.join(modules, syncName)), 'sync fixture')
        assert.ok(fs.existsSync(path.join(modules, syncName, 'index.js')))
        assert.ok(fs.existsSync(path.join(target, 'dist', 'index.js')))
        execFileSync(process.execPath, ['-e', "require('./dist/proxy-socket')"], { ...options, cwd: target })
    }
    const options = { cwd: release, env: { ...process.env, HOME: home, APPDATA: appData }, encoding: 'utf8' }
    fs.mkdirSync(release)
    const tar = windows ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar'
    execFileSync(tar, ['-xf', archive, '-C', release])
    assert.deepEqual(fs.readdirSync(release).sort(), ['install.cmd', 'install.command', name + '.tgz'].sort())
    const install = () => windows
        ? execFileSync('cmd.exe', ['/d', '/c', 'install.cmd'], options)
        : execFileSync('./install.command', [], options)

    // Sync Config installed first, with an existing shared manifest and lockfile.
    fs.mkdirSync(plugins, { recursive: true })
    fs.writeFileSync(rootManifest, JSON.stringify({ private: true, description: '保留原字段' }))
    seedSync()
    install()
    const registered = JSON.parse(fs.readFileSync(rootManifest))
    assert.equal(registered.description, '保留原字段')
    assert.equal(registered.dependencies[syncName], syncSpec)
    assert.match(registered.dependencies[name], /^file:\.ssh-proxy-packages\/[a-f0-9]{64}\.tgz$/)
    verifyBoth()
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

    // Reinstall Sync Config using npm's reifier after proxy installation.
    fs.rmSync(target, { recursive: true })
    manage('--no-save', syncSpec)
    verifyBoth()

    // Start with the proxy alone, then install Sync Config in that same tree.
    fs.rmSync(plugins, { recursive: true })
    install()
    seedSync()
    verifyBoth()

    const payload = path.join(release, name + '.tgz')
    fs.writeFileSync(payload, 'incomplete archive')
    const previousManifest = fs.readFileSync(rootManifest, 'utf8')
    const failed = windows
        ? spawnSync('cmd.exe', ['/d', '/c', 'install.cmd'], options)
        : spawnSync('./install.command', [], options)
    assert.equal(failed.error, undefined)
    assert.notEqual(failed.status, 0)
    assert.equal(fs.readFileSync(rootManifest, 'utf8'), previousManifest)
    verifyBoth()
    console.log('Passed installation, upgrade, both plugin install orders, offline recovery and invalid archive checks.')
} finally {
    fs.rmSync(scratch, { recursive: true, force: true })
}
