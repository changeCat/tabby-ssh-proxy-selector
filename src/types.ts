export type ProxyProtocol = 'socks5' | 'http-connect'

export interface ProxyManagerConfig {
    protocol: ProxyProtocol
    host: string
    port: string
    selectedProfileIds: string[]
}

export interface ProxyEntry {
    id: string
    name: string
    type: string
    host: string
    port: number
    username?: string
    password?: string
}

export interface SSHProxySelectorConfig {
    proxies: ProxyEntry[]
    profileProxyMap: Record<string, string>
}
