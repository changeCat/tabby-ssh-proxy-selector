const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const { readRouting, resolveRoute, sessionProfile } = require('../dist/routing')

const team = { id: 'servers', name: '服务器' }
const profile = Object.freeze({ id: 'host', type: 'ssh', group: team.id, options: Object.freeze({ host: 'example.test' }) })

test('legacy selections, group IDs and explicit direct overrides', () => {
    const store = { groups: [team] }
    const config = readRouting({ host: 'proxy.test', port: 1081, selectedProfileIds: ['host'] })
    assert.equal(resolveRoute(config, profile, store).preset.host, 'proxy.test')
    delete config.profiles.host
    assert.equal(sessionProfile(profile, resolveRoute(config, profile, store)), profile)
    config.groups['group:servers'] = 'default'
    assert.equal(resolveRoute(config, { ...profile, id: 'new' }, store).choice, 'default')
    config.profiles.host = 'direct'
    const native = { ...profile, options: { ...profile.options, socksProxyHost: 'old', httpProxyHost: 'old', proxyCommand: 'custom', jumpHost: 'jump' } }
    const direct = sessionProfile(native, resolveRoute(config, native, store))
    for (const key of ['socksProxyHost', 'httpProxyHost', 'proxyCommand', 'jumpHost']) {
        assert.equal(direct.options[key], null)
        assert.ok(native.options[key])
    }
    config.profiles.host = 'missing'
    assert.throws(() => resolveRoute(config, profile, store), /预设/)
})

function loadSettings () {
    const load = Module._load
    try {
        Module._load = function (id, ...args) {
            if (id === '@angular/core') { return { Component: () => target => target, Inject: () => () => {} } }
            if (id === 'tabby-core' || id === './ssh-proxy.service') { return {} }
            return load.call(this, id, ...args)
        }
        return require('../dist/settings-tab.component').ProxyManagerSettingsComponent
    } finally { Module._load = load }
}

test('settings keep the group preset through save and inherit it for newly added profiles', async () => {
    const Settings = loadSettings()
    const listeners = new Set()
    const store = { profiles: [profile], proxyManager: {} }
    let saved
    const config = {
        store,
        changed$: { subscribe (listener) {
            listeners.add(listener)
            return { unsubscribe: () => listeners.delete(listener) }
        } },
        async save () {
            saved = JSON.stringify(store.proxyManager)
            for (const listener of listeners) { listener() }
        },
    }
    const settings = new Settings(config, {}, {})
    const group = settings.groups[0].key
    settings.setRule(settings.draft.groups, group, 'default')
    assert.equal(settings.connectionChoice(profile.id, group), 'default')
    await settings.save()
    assert.equal(JSON.parse(saved).routing.groups[group], 'default')
    settings.ngOnDestroy()
    store.proxyManager = JSON.parse(saved)

    const reopened = new Settings(config, {}, {})
    assert.equal(reopened.connectionChoice(profile.id, group), 'default')
    reopened.setRule(reopened.draft.profiles, profile.id, 'direct')
    reopened.groups[0].collapsed = true
    store.profiles.push({ ...profile, id: 'new' })
    for (const listener of listeners) { listener() }
    assert.equal(reopened.count, 2)
    assert.equal(reopened.groups[0].collapsed, true)
    assert.equal(reopened.draft.profiles.new, undefined)
    assert.equal(reopened.connectionChoice('new', group), 'default')
    assert.equal(reopened.connectionChoice(profile.id, group), 'direct')
    reopened.ngOnDestroy()
    assert.equal(listeners.size, 0)
})

test('optional proxy credentials survive blank password edits and require a complete pair', async () => {
    const Settings = loadSettings()
    const config = { store: { proxyManager: {} }, changed$: { subscribe: () => ({ unsubscribe () {} }) }, save: async () => {} }
    const settings = new Settings(config, {}, {})
    settings.editor.authEnabled = true
    settings.passwordEdits[settings.editor.id] = 'draft-password'
    await settings.save()
    assert.equal(settings.hasError, true)
    assert.equal(config.store.proxyManager.routing, undefined)

    settings.clearAuthentication(settings.editor)
    settings.editor.authEnabled = true
    settings.editor.username = 'alice'
    await settings.save()
    assert.equal(settings.hasError, true)
    settings.editor.encryptedPassword = 'previously-encrypted'
    await settings.save()
    assert.equal(settings.hasError, false)
    const saved = config.store.proxyManager.routing.presets[0]
    assert.equal(saved.encryptedPassword, 'previously-encrypted')
    settings.editor.authEnabled = false
    await settings.save()
    const reopened = new Settings(config, {}, {})
    assert.equal(reopened.usesAuthentication(reopened.editor), false)
    assert.equal(reopened.editor.username, 'alice')
    assert.equal(reopened.editor.encryptedPassword, saved.encryptedPassword)
    reopened.ngOnDestroy()
    settings.editor.authEnabled = true
    settings.editor.username = ''
    await settings.save()
    assert.equal(settings.hasError, true)
    assert.equal(saved.username, 'alice')

    settings.clearAuthentication(settings.editor)
    await settings.save()
    assert.equal(settings.hasError, false)
    assert.equal(config.store.proxyManager.routing.presets[0].encryptedPassword, undefined)
    assert.equal(config.store.proxyManager.routing.presets[0].username, undefined)
})

test('normal login, retries and concurrent temporary tabs stay isolated', async () => {
    class Tab {
        async initializeSession (failFirst = false) {
            this.failNext = failFirst
            if (failFirst) { await this.setupOneSession(null, this.profile).catch(() => {}) }
            return this.setupOneSession(null, this.profile)
        }
        async setupOneSession (_, received, multiplex = true) {
            await new Promise(resolve => setImmediate(resolve))
            this.paths.push(received.options.httpProxyHost || received.options.socksProxyHost || 'direct')
            this.multiplex = multiplex
            if (this.failNext) {
                this.failNext = false
                throw Error('retry')
            }
            return { profile: received }
        }
    }
    const angular = { Injectable: () => target => target, Inject: () => () => {} }
    const load = Module._load
    let Service
    try {
        Module._load = function (id, ...args) {
            if (id === '@angular/core') { return angular }
            if (id === 'tabby-ssh') { return { SSHTabComponent: Tab } }
            if (id === 'tabby-core') { return {} }
            return load.call(this, id, ...args)
        }
        Service = require('../dist/ssh-proxy.service').SSHProxyService
    } finally { Module._load = load }

    const tabs = []
    const app = { openNewTab: ({ inputs }) => {
        const tab = Object.assign(new Tab(), inputs, { paths: [] })
        tabs.push(tab)
        return tab
    } }
    const profiles = { newTabParametersForProfile: async p => ({ inputs: { profile: { ...p } } }) }
    const routing = readRouting()
    routing.groups['group:servers'] = 'default'
    const service = new Service({ store: { proxyManager: { routing } } }, profiles, app)
    const native = { ...profile, id: 'outside', group: 'other' }
    const normal = app.openNewTab(await profiles.newTabParametersForProfile(native))
    await service.openOnce(profile, { choice: 'direct' })
    await service.openOnce(profile, { choice: 'default', preset: { ...routing.presets[0], host: 'temp' } })
    await Promise.all(tabs.map(tab => tab.initializeSession(true)))
    assert.deepEqual(normal.paths, ['direct', 'direct'])
    assert.deepEqual(tabs[1].paths, ['direct', 'direct'])
    assert.deepEqual(tabs[2].paths, ['temp', 'temp'])
    assert.equal(tabs[2].multiplex, false)
    assert.equal(normal.multiplex, true)
    await tabs[1].initializeSession()
    assert.deepEqual(tabs[1].paths, ['direct', 'direct', '127.0.0.1'])
    routing.profiles.host = 'direct'
    await tabs[1].initializeSession()
    assert.equal(tabs[1].paths.at(-1), 'direct')
    assert.match(service.recent.get('host').path, /^直连/)
    assert.deepEqual(profile.options, { host: 'example.test' })
})
