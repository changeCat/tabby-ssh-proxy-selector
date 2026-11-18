import { Component, Inject } from '@angular/core'
import { ConfigService, ProfilesService } from 'tabby-core'
import { randomUUID } from 'crypto'
import { SSHProxyService } from './ssh-proxy.service'
import { groupKey, groupLabel, pathLabel, readRouting, resolveRoute, sessionProfile, validateEndpoint } from './routing'
import { testConnection } from './connection-test'
import { Preset, RoutingConfig } from './types'
import { styles, template } from './settings-view'

@Component({ selector: 'proxy-manager-settings', standalone: false, template, styles: [styles] })
export class ProxyManagerSettingsComponent {
    draft: RoutingConfig
    editor?: Preset
    groups: Array<{ key: string, name: string, profiles: any[] }>
    count: number
    dirty = false
    saving = false
    message = ''
    hasError = false
    active: any
    private fullProfile: any
    temporary = ''
    previewPath = ''
    previewSource = ''
    steps: string[] = []
    actionError = ''
    testing = false
    opening = false
    private revision = 0

    constructor (
        @Inject(ConfigService) private config: ConfigService,
        @Inject(ProfilesService) private profiles: ProfilesService,
        @Inject(SSHProxyService) public runtime: SSHProxyService,
    ) {
        const store = config.store
        this.draft = readRouting(store.proxyManager)
        this.editor = this.draft.presets[0]
        const ssh = (store.profiles || []).filter(p => p.type === 'ssh' && p.id)
        this.count = ssh.length
        const grouped = new Map<string, any[]>()
        for (const profile of ssh) {
            const key = groupKey(profile)
            if (!grouped.has(key)) { grouped.set(key, []) }
            grouped.get(key)!.push(profile)
        }
        this.groups = Array.from(grouped, ([key, profiles]) => ({ key, name: groupLabel(key, store), profiles }))
    }

    changed (): void {
        this.dirty = true
        this.message = ''
        this.refreshPreview()
    }

    setRule (rules: Record<string, string>, key: string, choice: string): void {
        if (choice) { rules[key] = choice }
        else { delete rules[key] }
        this.changed()
    }

    addPreset (): void {
        this.editor = { id: randomUUID(), name: '新代理', protocol: 'socks5', host: '127.0.0.1', port: '1080' }
        this.draft.presets.push(this.editor)
        this.changed()
    }

    removePreset (): void {
        const id = this.editor!.id
        if ([...Object.values(this.draft.groups), ...Object.values(this.draft.profiles)].includes(id)) {
            this.message = '仍有规则使用此预设。请先更改对应线路，再移除预设。'
            this.hasError = true
            return
        }
        this.draft.presets = this.draft.presets.filter(p => p.id !== id)
        this.editor = this.draft.presets[0]
        if (this.temporary === id) { this.temporary = '' }
        this.changed()
    }

    inspect (profile: any): void {
        this.active = this.active === profile ? null : profile
        this.fullProfile = this.active ? this.profiles.getConfigProxyForProfile(this.active) : null
        this.temporary = ''
        this.refreshPreview()
    }

    private currentRoute () {
        return resolveRoute(this.draft, this.active, this.config.store, this.temporary)
    }

    refreshPreview (): void {
        ++this.revision
        this.steps = []
        this.actionError = ''
        this.previewSource = ''
        if (!this.active) { return }
        try {
            const route = this.currentRoute()
            this.previewSource = route.source
            this.previewPath = pathLabel(sessionProfile(this.fullProfile, route).options, route.preset)
        } catch (error) {
            this.previewPath = error.message
        }
    }

    async test (): Promise<void> {
        if (this.testing) { return }
        this.testing = true
        this.refreshPreview()
        const revision = this.revision
        try {
            const options = sessionProfile(this.fullProfile, this.currentRoute()).options
            await testConnection(options, step => {
                if (revision === this.revision) { this.steps.push(step) }
            })
        } catch (error) {
            if (revision === this.revision) {
                const step = this.steps[this.steps.length - 1]
                this.actionError = (step ? step + '失败 · ' : '') + error.message
            }
        } finally {
            this.testing = false
        }
    }

    async open (): Promise<void> {
        if (this.opening) { return }
        this.opening = true
        this.actionError = ''
        try {
            const route = this.currentRoute()
            if (route.preset) { validateEndpoint(route.preset) }
            await this.runtime.openOnce(this.active, route)
        } catch (error) {
            this.actionError = error.message
        } finally { this.opening = false }
    }

    async save (): Promise<void> {
        if (this.saving) { return }
        this.saving = true
        this.hasError = false
        try {
            const routing = readRouting({ routing: this.draft })
            const names = new Set<string>()
            for (const preset of routing.presets) {
                preset.name = preset.name.trim()
                preset.host = preset.host.trim()
                preset.port = String(preset.port).trim()
                if (!preset.name || names.has(preset.name)) { throw new Error('请为每个预设填写不同的名称') }
                validateEndpoint(preset)
                names.add(preset.name)
            }
            const manager = this.config.store.proxyManager
            const previous = manager.routing
            manager.routing = routing
            try {
                await this.config.save()
            } catch (error) {
                manager.routing = previous
                throw error
            }
            const editorId = this.editor?.id
            this.draft = readRouting(manager)
            this.editor = this.draft.presets.find(p => p.id === editorId)
            this.dirty = false
            this.refreshPreview()
            this.message = '已保存。新连接将使用更新后的线路。'
        } catch (error) {
            this.hasError = true
            this.message = error.message
        } finally { this.saving = false }
    }
}
