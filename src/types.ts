export type ProxyProtocol = 'socks5' | 'http-connect'

export interface ProxyEndpoint {
    protocol: ProxyProtocol
    host: string
    port: string
    authEnabled?: boolean
    username?: string
    encryptedPassword?: string
}

export function usesAuthentication (endpoint: ProxyEndpoint): boolean {
    return endpoint.authEnabled ?? Boolean(endpoint.username || endpoint.encryptedPassword)
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
