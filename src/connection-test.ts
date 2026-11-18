import { once } from 'events'
import { createConnection, Socket } from 'net'
import { createProxySocket } from './proxy-socket'
import { ProxyEndpoint } from './types'

const deadline = 6000

async function dial (host: string, port: number): Promise<Socket> {
    const socket = createConnection({ host, port })
    const timer = setTimeout(() => socket.destroy(new Error('TCP 连接超时')), deadline)
    try {
        await once(socket, 'connect')
        return socket
    } finally {
        clearTimeout(timer)
    }
}

async function readBanner (socket: Socket): Promise<void> {
    const timer = setTimeout(() => socket.destroy(new Error('等待 SSH 标识超时')), deadline)
    let text = ''
    try {
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject)
            socket.once('close', () => reject(new Error('目标未返回 SSH 协议标识')))
            // The SOCKS client replays handshake-adjacent bytes as a data event.
            socket.on('data', chunk => {
                text += chunk.toString('ascii')
                if (/(?:^|\n)SSH-(?:2\.0|1\.99)-[^\r\n]+\r?\n/.test(text)) { resolve() }
                else if (text.length > 8192) { reject(new Error('未识别到 SSH 协议标识')) }
            })
        })
    } finally {
        clearTimeout(timer)
        socket.destroy()
    }
}

export async function testConnection (options: any, progress: (step: string) => void): Promise<void> {
    const host = options.host?.trim()
    const port = Number(options.port ?? 22)
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) { throw new Error('目标主机或端口无效') }
    if (options.proxyCommand || options.jumpHost) { throw new Error('此线路使用 Tabby 代理命令或跳板，请在 SSH 标签页中验证') }
    let socket: Socket
    if (options.socksProxyHost || options.httpProxyHost) {
        const socks = !!options.socksProxyHost
        const proxy: ProxyEndpoint = {
            protocol: socks ? 'socks5' : 'http-connect', host: socks ? options.socksProxyHost : options.httpProxyHost,
            port: String(socks ? options.socksProxyPort || 1080 : options.httpProxyPort || 8080),
        }
        progress('连接代理')
        const probe = await dial(proxy.host, +proxy.port)
        probe.destroy()
        progress('通过代理连接目标')
        socket = await createProxySocket(proxy, host, port, deadline)
    } else {
        progress('连接目标')
        socket = await dial(host, port)
    }
    progress('等待 SSH 标识')
    await readBanner(socket)
    progress('已收到 SSH 标识')
}
