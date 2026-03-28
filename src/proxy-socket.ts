import * as net from 'net'
import { pluginError, pluginLog } from './logger'
import { ProxyManagerConfig } from './types'

const { SocksClient } = require('socks')

export async function createProxySocket (
    proxy: ProxyManagerConfig,
    targetHost: string,
    targetPort: number,
): Promise<net.Socket> {
    if (proxy.protocol === 'socks5') {
        return await createSocks5Socket(proxy, targetHost, targetPort)
    }

    return await createHttpConnectSocket(proxy, targetHost, targetPort)
}

async function createSocks5Socket (
    proxy: ProxyManagerConfig,
    targetHost: string,
    targetPort: number,
): Promise<net.Socket> {
    try {
        const result = await SocksClient.createConnection({
            command: 'connect',
            proxy: {
                host: proxy.host,
                port: Number(proxy.port),
                type: 5,
            },
            destination: {
                host: targetHost,
                port: targetPort,
            },
        })

        return result.socket
    } catch (error) {
        pluginError('proxy-socket', 'SOCKS5 connection failed', error)
        throw error
    }
}

async function createHttpConnectSocket (
    proxy: ProxyManagerConfig,
    targetHost: string,
    targetPort: number,
): Promise<net.Socket> {
    return await new Promise((resolve, reject) => {
        const socket = net.connect(Number(proxy.port), proxy.host)
        const chunks: Buffer[] = []
        let settled = false

        const cleanup = () => {
            socket.removeListener('connect', onConnect)
            socket.removeListener('data', onData)
            socket.removeListener('error', onError)
            socket.removeListener('close', onClose)
        }

        const fail = (error: Error) => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            try {
                socket.destroy()
            } catch {
                // ignore
            }
            pluginError('proxy-socket', 'HTTP CONNECT failed', error)
            reject(error)
        }

        const succeed = () => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            resolve(socket)
        }

        const onConnect = () => {
            const request =
                `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
                `Host: ${targetHost}:${targetPort}\r\n` +
                `Connection: keep-alive\r\n` +
                `Proxy-Connection: keep-alive\r\n` +
                `\r\n`

            socket.write(request)
        }

        const onData = (chunk: Buffer) => {
            chunks.push(chunk)
            const buffer = Buffer.concat(chunks)
            const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'))

            if (headerEnd === -1) {
                return
            }

            const header = buffer.slice(0, headerEnd).toString('utf8')
            const rest = buffer.slice(headerEnd + 4)
            const statusLine = header.split('\r\n')[0] || ''

            if (!/^HTTP\/1\.[01] 200\b/i.test(statusLine)) {
                fail(new Error(`HTTP CONNECT failed: ${statusLine}`))
                return
            }

            if (rest.length > 0) {
                socket.unshift(rest)
            }

            succeed()
        }

        const onError = (error: Error) => fail(error)
        const onClose = () => fail(new Error('Proxy socket closed before CONNECT completed'))

        socket.on('connect', onConnect)
        socket.on('data', onData)
        socket.on('error', onError)
        socket.on('close', onClose)
    })
}
