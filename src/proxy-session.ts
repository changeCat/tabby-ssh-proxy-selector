import { once } from 'events'
import { createServer } from 'http'
import { AddressInfo, Socket } from 'net'
import { destination } from './routing'
import { createProxySocket } from './proxy-socket'
import { Preset } from './types'

// Tabby's native proxy transports accept only a host and port. Hand off one
// authenticated tunnel while retaining the real SSH destination for host keys.
export async function withProxySession<T> (preset: Preset, profile: any, start: (profile: any) => Promise<T>): Promise<T> {
    const { host, port = 22 } = profile.options
    const authority = destination(profile.options)
    const server = createServer((_req, res) => res.writeHead(405, { Connection: 'close' }).end())
    const clients = new Set<Socket>()
    let accepted: Socket | undefined
    let failure: Error | undefined
    server.on('connection', socket => {
        clients.add(socket)
        socket.once('close', () => clients.delete(socket))
        socket.on('error', () => socket.destroy())
        socket.setTimeout(5000, () => socket.destroy())
    })
    server.on('connect', async (request, client: Socket, head) => {
        if (accepted || request.url !== authority) { client.destroy(); return }
        accepted = client
        server.close()
        client.setTimeout(0)
        try {
            const upstream = await createProxySocket(preset, host, port || 22)
            if (client.destroyed) { upstream.destroy(); return }
            client.once('close', () => upstream.destroy())
            upstream.on('error', () => client.destroy())
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
            if (head.length) { upstream.write(head) }
            client.pipe(upstream)
            if (preset.protocol === 'socks5') {
                // socks re-emits handshake-adjacent bytes on its next immediate,
                // even if a fast peer has already sent FIN.
                const replay = (chunk: Buffer) => client.write(chunk)
                upstream.pause().on('data', replay)
                await new Promise<void>(resolve => setImmediate(resolve))
                upstream.off('data', replay)
            }
            if (upstream.readableEnded || upstream.destroyed) { client.end() }
            else { upstream.pipe(client) }
        } catch (error) {
            failure = error
            client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n')
        }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const timer = setTimeout(() => { if (server.listening) { server.close() } }, 30000)
    let started = false
    try {
        const session = await start({
            ...profile, options: {
                ...profile.options, socksProxyHost: null, socksProxyPort: null,
                httpProxyHost: '127.0.0.1', httpProxyPort: (server.address() as AddressInfo).port,
            },
        })
        started = true
        return session
    } catch (error) { throw failure ?? error }
    finally {
        clearTimeout(timer)
        if (server.listening) { server.close() }
        for (const socket of clients) {
            if (!started || socket !== accepted) { socket.destroy() }
        }
    }
}
