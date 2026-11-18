export type ProxyProtocol = 'socks5' | 'http-connect'

export interface ProxyEndpoint {
    protocol: ProxyProtocol
    host: string
    port: string
}

export interface Preset extends ProxyEndpoint {
    id: string
    name: string
}

export interface RoutingConfig {
    presets: Preset[]
    groups: Record<string, string>
    profiles: Record<string, string>
}
