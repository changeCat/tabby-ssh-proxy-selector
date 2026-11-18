import { request } from 'http'
import { isIPv6, Socket } from 'net'
import { SocksClient } from 'socks'
import { pluginError } from './logger'
import { ProxyEndpoint } from './types'
import { loadPassword } from './proxy-credentials'

export async function createProxySocket (
    proxy: ProxyEndpoint,
    targetHost: string,
    targetPort: number,
    timeoutMs = 30000,
): Promise<Socket> {
    const password = loadPassword(proxy)
    try {
        if (proxy.protocol === 'socks5') {
            const { socket } = await SocksClient.createConnection({
                command: 'connect',
                timeout: timeoutMs,
                proxy: { host: proxy.host, port: Number(proxy.port), type: 5,
                    ...(password === undefined ? {} : { userId: proxy.username, password }) },
                destination: { host: targetHost, port: targetPort },
            })
            return socket
        }
        return await createHttpConnectSocket(proxy, targetHost, targetPort, timeoutMs, password)
    } catch (error) {
        // SOCKS errors carry the full options object, including the credentials.
        if (password !== undefined) {
            const message = error.message === 'HTTP CONNECT 407' || /auth/i.test(error.message)
                ? '代理认证失败，请检查用户名和密码' : '无法通过已配置认证的代理连接目标'
            throw new Error(message)
        }
        pluginError('proxy-socket', `${proxy.protocol} connection failed`, error)
        throw error
    }
}

function createHttpConnectSocket (
    proxy: ProxyEndpoint,
    targetHost: string,
    targetPort: number,
    timeoutMs: number,
    password?: string,
): Promise<Socket> {
    const authority = `${isIPv6(targetHost) ? `[${targetHost}]` : targetHost}:${targetPort}`
    return new Promise((resolve, reject) => {
        const tunnel = request({
            method: 'CONNECT',
            hostname: proxy.host,
            port: Number(proxy.port),
            path: authority,
            headers: {
                Host: authority, Connection: 'keep-alive',
                ...(password === undefined ? {} : {
                    'Proxy-Authorization': 'Basic ' + Buffer.from(proxy.username + ':' + password).toString('base64'),
                }),
            },
            agent: false,
        })
        const timeout = setTimeout(() => tunnel.destroy(new Error('HTTP CONNECT timed out')), timeoutMs)
        tunnel.once('error', error => {
            clearTimeout(timeout)
            reject(error)
        })
        tunnel.once('connect', (response, socket, head) => {
            clearTimeout(timeout)
            const status = response.statusCode ?? 0
            if (status < 200 || status >= 300) {
                socket.destroy()
                reject(new Error(password === undefined ? `HTTP CONNECT failed: ${status} ${response.statusMessage || ''}`.trim() : `HTTP CONNECT ${status}`))
                return
            }
            // The proxy may deliver the SSH banner together with its CONNECT response.
            if (head.length) {
                socket.unshift(head)
            }
            resolve(socket)
        })
        tunnel.end()
    })
}
