const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')
const test = require('node:test')
const { createProxySocket } = require('../dist/proxy-socket')
const { testConnection } = require('../dist/connection-test')

async function startProxy (t, onRequest) {
    const server = net.createServer(socket => {
        let request = ''
        socket.on('data', chunk => {
            request += chunk.toString()
            if (request.includes('\r\n\r\n')) {
                socket.removeAllListeners('data')
                onRequest(socket, request)
            }
        })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => server.close())
    return { protocol: 'http-connect', host: '127.0.0.1', port: String(server.address().port) }
}

test('CONNECT preserves the SSH banner and formats an IPv6 authority', { timeout: 5000 }, async t => {
    const banner = 'SSH-2.0-test\r\n'
    let request
    const proxy = await startProxy(t, (socket, received) => {
        request = received
        socket.write('HTTP/1.1 200 Connection established\r\n')
        setImmediate(() => socket.end('\r\n' + banner))
    })
    const tunnel = await createProxySocket(proxy, '::1', 22)
    const chunks = []
    for await (const chunk of tunnel) { chunks.push(chunk) }
    assert.equal(Buffer.concat(chunks).toString(), banner)
    assert.match(request, /^CONNECT \[::1\]:22 HTTP\/1\.1\r\n/)
})

test('CONNECT rejects a refused tunnel', async t => {
    // The production error path writes a plugin log. Keep it in the test directory.
    const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tabby-log-'))
    const envKey = { win32: 'APPDATA', darwin: 'HOME' }[process.platform] || 'XDG_CONFIG_HOME'
    const previous = process.env[envKey]
    process.env[envKey] = logRoot
    t.after(() => {
        if (previous === undefined) { delete process.env[envKey] }
        else { process.env[envKey] = previous }
        fs.rmSync(logRoot, { recursive: true, force: true })
    })
    const proxy = await startProxy(t, socket => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'))
    await assert.rejects(createProxySocket(proxy, 'example.test', 22), /403 Forbidden/)
})

test('connection diagnostics verify the SSH identification through the selected tunnel', async t => {
    const proxy = await startProxy(t, socket => socket.end('HTTP/1.1 200 OK\r\n\r\nSSH-2.0-local-test\r\n'))
    const steps = []
    await testConnection({ host: 'example.test', httpProxyHost: proxy.host, httpProxyPort: proxy.port }, step => steps.push(step))
    assert.deepEqual(steps, ['连接代理', '通过代理连接目标', '等待 SSH 标识', '已收到 SSH 标识'])
    await assert.rejects(testConnection({ host: 'example.test', jumpHost: 'jump' }, () => {}), /跳板/)
})

test('SOCKS5 and direct diagnostics both wait for the SSH server banner', { timeout: 5000 }, async t => {
    const target = net.createServer(socket => socket.end('SSH-2.0-test\r\n'))
    target.listen(0, '127.0.0.1')
    await once(target, 'listening')
    t.after(() => target.close())
    const profile = { host: '127.0.0.1', port: target.address().port }
    const direct = []
    await testConnection(profile, step => direct.push(step))
    assert.deepEqual(direct, ['连接目标', '等待 SSH 标识', '已收到 SSH 标识'])

    const proxy = net.createServer(socket => {
        socket.once('data', () => {
            socket.write(Buffer.from([5, 0]))
            socket.once('data', request => {
                assert.deepEqual([...request.subarray(0, 4)], [5, 1, 0, 1])
                socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 22]))
                socket.end('SSH-2.0-test\r\n')
            })
        })
    })
    proxy.listen(0, '127.0.0.1')
    await once(proxy, 'listening')
    t.after(() => proxy.close())
    const steps = []
    await testConnection({ ...profile, socksProxyHost: '127.0.0.1', socksProxyPort: proxy.address().port }, step => steps.push(step))
    assert.deepEqual(steps, ['连接代理', '通过代理连接目标', '等待 SSH 标识', '已收到 SSH 标识'])
})
