import { Preset, ProxyEndpoint, RoutingConfig } from './types'

export function readRouting (saved: any = {}): RoutingConfig {
    if (saved.routing) {
        const { presets, groups, profiles } = saved.routing
        if (!Array.isArray(presets)) { throw new Error('代理预设配置无效') }
        return {
            presets: presets.map(p => ({ ...p })),
            groups: Object.assign(Object.create(null), groups),
            profiles: Object.assign(Object.create(null), profiles),
        }
    }
    const profiles = Object.create(null)
    for (const id of Array.isArray(saved.selectedProfileIds) ? saved.selectedProfileIds : []) { profiles[id] = 'default' }
    return {
        presets: [{
            id: 'default', name: '默认代理', protocol: saved.protocol === 'http-connect' ? 'http-connect' : 'socks5',
            host: saved.host || '127.0.0.1', port: String(saved.port || '1080'),
        }],
        groups: Object.create(null), profiles,
    }
}

function groupValue (value: any): string {
    if (typeof value === 'string') { return value.trim() }
    if (Array.isArray(value)) { return value.map(groupValue).filter(Boolean).join(' / ') }
    return value ? groupValue(value.id || value.path || value.name) : ''
}

export function groupKey (p: any): string {
    const key = groupValue(p.group ?? p.grouping ?? p.groupPath ?? p.options?.group)
    return key ? 'group:' + key : 'ungrouped'
}

export function groupLabel (key: string, store: any): string {
    if (key === 'ungrouped') { return '未分组' }
    const id = key.slice(6)
    const groups = [...(Array.isArray(store.groups) ? store.groups : []), ...(Array.isArray(store.profileGroups) ? store.profileGroups : [])]
    return groups.find(g => g.id === id)?.name || id
}

export interface Route {
    choice: string
    source: string
    preset?: Preset
}

export function resolveRoute (config: RoutingConfig, profile: any, store: any, temporary?: string): Route {
    const group = groupKey(profile)
    const own = config.profiles[profile.id]
    const inherited = config.groups[group]
    const choice = temporary || own || inherited || 'native'
    const source = temporary ? '仅本次' : own ? '单机规则' : inherited ? '分组 · ' + groupLabel(group, store) : 'Tabby 设置'
    const preset = config.presets.find(item => item.id === choice)
    if (choice !== 'native' && choice !== 'direct' && !preset) { throw new Error('找不到所选代理预设，请重新选择线路') }
    return { choice, source, preset }
}

export function validateEndpoint (endpoint: ProxyEndpoint): void {
    if (endpoint.protocol !== 'socks5' && endpoint.protocol !== 'http-connect') { throw new Error('不支持的代理协议') }
    if (!endpoint.host.trim() || /[\s\/]/.test(endpoint.host) || !/^\d+$/.test(endpoint.port)
        || +endpoint.port < 1 || +endpoint.port > 65535) {
        throw new Error('请填写有效的代理主机和 1–65535 之间的端口')
    }
}

export function sessionProfile (profile: any, route: Route): any {
    if (route.choice === 'native') { return profile }
    const preset = route.preset
    if (preset) { validateEndpoint(preset) }
    const socks = preset?.protocol === 'socks5'
    const http = preset?.protocol === 'http-connect'
    return {
        ...profile,
        options: {
            ...profile.options,
            proxyCommand: null, jumpHost: null,
            socksProxyHost: socks ? preset.host : null, socksProxyPort: socks ? Number(preset.port) : null,
            httpProxyHost: http ? preset.host : null, httpProxyPort: http ? Number(preset.port) : null,
        },
    }
}

export function destination (options: any): string {
    const host = options.host || '?'
    return (host.includes(':') && !host.startsWith('[') ? '[' + host + ']' : host) + ':' + (options.port || 22)
}

export function pathLabel (options: any, preset?: Preset): string {
    const target = destination(options)
    if (options.proxyCommand) { return 'Tabby 代理命令 → ' + target }
    if (options.jumpHost) { return '跳板 ' + options.jumpHost + ' → ' + target }
    const socks = !!options.socksProxyHost
    if (!socks && !options.httpProxyHost) { return '直连 → ' + target }
    const host = socks ? options.socksProxyHost : options.httpProxyHost
    const port = socks ? options.socksProxyPort || 1080 : options.httpProxyPort || 8080
    const matches = preset && preset.host === host && +preset.port === +port && (preset.protocol === 'socks5') === socks
    const label = matches ? preset.name : socks ? 'SOCKS5' : 'HTTP CONNECT'
    return label + ' (' + destination({ host, port }) + ') → ' + target
}
