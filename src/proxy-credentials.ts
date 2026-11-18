import { createRequire } from 'module'
import { join } from 'path'
import { ProxyEndpoint, usesAuthentication } from './types'

function safeStorage () {
    try {
        // External plugins can be installed outside Tabby's node_modules tree.
        const resources = (process as NodeJS.Process & { resourcesPath: string }).resourcesPath
        const hostRequire = createRequire(join(resources, 'app.asar', 'package.json'))
        const storage = hostRequire('@electron/remote').require('electron').safeStorage
        if (storage.isEncryptionAvailable()) { return storage }
    } catch { /* Surface an actionable error without the underlying secret. */ }
    throw new Error('系统密码存储不可用，请检查系统钥匙串或凭据服务')
}

export function storePassword (endpoint: ProxyEndpoint, password: string): void {
    if (usesAuthentication(endpoint)) { validatePassword(endpoint, password) }
    endpoint.encryptedPassword = Buffer.from(safeStorage().encryptString(password)).toString('base64')
}

export function validatePassword (endpoint: ProxyEndpoint, password: string): void {
    if (!endpoint.username || !password) { throw new Error('请同时填写代理用户名和密码') }
    if (endpoint.protocol === 'socks5' && [endpoint.username, password].some(value => Buffer.byteLength(value) > 255)) {
        throw new Error('SOCKS5 用户名和密码各限 255 字节')
    }
    if (endpoint.protocol === 'http-connect' && endpoint.username.includes(':')) {
        throw new Error('HTTP Basic 代理用户名不能包含冒号')
    }
}

export function loadPassword (endpoint: ProxyEndpoint): string | undefined {
    if (!usesAuthentication(endpoint)) { return undefined }
    if (!endpoint.encryptedPassword) { throw new Error('请填写代理密码并保存') }
    const storage = safeStorage()
    let password: string
    try {
        password = storage.decryptString(Buffer.from(endpoint.encryptedPassword, 'base64'))
    } catch { throw new Error('当前系统无法解密此代理密码，请重新输入并保存') }
    validatePassword(endpoint, password)
    return password
}
