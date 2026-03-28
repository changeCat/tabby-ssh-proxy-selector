import { Injectable } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { pluginError, pluginLog } from './logger'
import { createProxySocket } from './proxy-socket'
import { ProxyManagerConfig } from './types'

@Injectable()
export class SSHProxyService {
    private static patched = false
    private static transportPatched = false
    private patchedRuntimeStarts = new WeakSet<object>()
    private patchedRuntimePrototypes = new WeakSet<object>()
    private activeProfiles: any[] = []

    constructor (
        private config: ConfigService,
    ) {
        this.patchProfilesService()
        this.patchRusshTransport()
        this.patchSSHSessionStart()
        this.patchSSH()
    }

    private patchSSH (): void {
        if (SSHProxyService.patched) {
            pluginLog('ssh-proxy', 'patch skipped: already patched')
            return
        }

        const sshAny = this.getSSHServicePatchTarget()
        if (!sshAny) {
            pluginLog('ssh-proxy', 'patch skipped: SSHService prototype not found')
            return
        }

        const candidateMethods = [
            'connect',
            'openConnection',
            'startSession',
            'createConnection',
            'setupOneSession',
            'initializeSessionMaybeMultiplex',
            'initializeSession',
        ]

        const availableMethods = candidateMethods.filter(name => typeof sshAny[name] === 'function')
        if (!availableMethods.length) {
            pluginLog('ssh-proxy', 'patch skipped: no candidate SSHService method found', candidateMethods)
            return
        }

        const self = this

        for (const methodName of availableMethods) {
            const original = sshAny[methodName]

            sshAny[methodName] = async function (...args: any[]) {

                const resolvedProfile = self.findSSHProfileArg(args) ?? self.extractSSHProfile(this)
                if (!resolvedProfile) {
                    return await original.apply(this, args)
                }

                const profile = methodName === 'setupOneSession'
                    ? self.prepareSetupOneSessionProfile(this, args, resolvedProfile)
                    : resolvedProfile

                const proxy = self.getProxyForProfile(profile)
                if (!proxy) {
                    return await original.apply(this, args)
                }

                const host = self.resolveHost(profile)
                const port = self.resolvePort(profile)
                if (!host) {
                    return await original.apply(this, args)
                }

                let sock: any = null
                try {
                    sock = await createProxySocket(proxy, host, port)
                    self.injectSock(args, profile, sock, this, methodName)
                    self.patchRuntimeSessionStarts(args, profile, this, `${methodName}:pre-call`)
                } catch (error) {
                    pluginError('ssh-proxy', 'failed to create proxy socket in SSHService flow', {
                        methodName,
                        error,
                    })
                    throw error
                }

                const result = await self.runWithActiveProfile(profile, () => original.apply(this, args))

                if (sock) {
                    self.injectSock(result ? [result, ...args] : args, profile, sock, this, `${methodName}:post-call`)
                }
                self.patchRuntimeSessionStarts(result ? [result, ...args] : args, profile, this, `${methodName}:post-call`)

                return result
            }
        }

        SSHProxyService.patched = true
        pluginLog('ssh-proxy', 'patch complete', { methodNames: availableMethods })
    }

    private patchProfilesService (): void {
        const coreModule = this.tryRequire('tabby-core')
        const profilesService = coreModule?.ProfilesService
        const prototype = profilesService?.prototype

        if (!prototype || typeof prototype.getConfigProxyForProfile !== 'function') {
            pluginLog('ssh-proxy', 'ProfilesService patch skipped: getConfigProxyForProfile not found')
            return
        }

        if ((prototype.getConfigProxyForProfile as any).__tabbyProxyPatched) {
            pluginLog('ssh-proxy', 'ProfilesService patch skipped: already patched')
            return
        }

        const self = this
        const original = prototype.getConfigProxyForProfile

        prototype.getConfigProxyForProfile = function (profile: any, options: any) {
            const result = original.call(this, profile, options)
            const sourceProfile = profile?.id ? profile : result
            const proxy = self.getProxyForProfile(sourceProfile)

            if (!proxy) {
                return result
            }

            self.applyProxySettings(result?.options ?? result, null, proxy, 'ProfilesService.getConfigProxyForProfile')
            return result
        }

        ;(prototype.getConfigProxyForProfile as any).__tabbyProxyPatched = true
        pluginLog('ssh-proxy', 'ProfilesService patch complete', {
            methodName: 'getConfigProxyForProfile',
        })
    }

    private patchSSHSessionStart (): void {
        const sshModule = this.tryRequire('tabby-ssh')
        if (!sshModule) {
            pluginLog('ssh-proxy', 'SSHSession patch skipped: tabby-ssh module unavailable')
            return
        }

        const exportKeys = Object.keys(sshModule)
        for (const key of exportKeys) {
            const candidate = sshModule[key]
            const prototype = candidate?.prototype
            if (!prototype || typeof prototype.start !== 'function') {
                continue
            }

            const methodNames = Object.getOwnPropertyNames(prototype)
            if (!methodNames.includes('start')) {
                continue
            }

            if ((prototype.start as any).__tabbyProxyPatched) {
                pluginLog('ssh-proxy', 'SSHSession start patch skipped: already patched', { key })
                return
            }

            const self = this
            const original = prototype.start

            prototype.start = async function (...args: any[]) {
                const profile = this?.profile ?? self.findSSHProfileArg(args) ?? self.extractSSHProfile(this)
                if (!profile) {
                    return await original.apply(this, args)
                }

                const proxy = self.getProxyForProfile(profile)
                if (!proxy) {
                    return await original.apply(this, args)
                }

                self.applyProfileProxy(profile, proxy, `SSHSession.start:${key}:pre`)
                self.injectSock(args, profile, null, this, `SSHSession.start:${key}:pre`)

                return await self.runWithActiveProfile(profile, () => original.apply(this, args))
            }

            ;(prototype.start as any).__tabbyProxyPatched = true
            pluginLog('ssh-proxy', 'SSHSession start patch complete', {
                key,
                methodNames,
            })
            return
        }

        pluginLog('ssh-proxy', 'SSHSession patch skipped: no export with start() found', { exportKeys })
    }

    private patchRuntimeSessionStarts (args: any[], profile: any, context?: any, sourcePrefix = 'runtime-session'): void {
        const candidates = this.collectInjectionCandidates(profile, `${sourcePrefix}.profile`)

        if (context && typeof context === 'object') {
            candidates.push(...this.collectInjectionCandidates(context, `${sourcePrefix}.this`))
        }

        for (let index = 0; index < args.length; index++) {
            const arg = args[index]
            if (!arg || typeof arg !== 'object') {
                continue
            }
            candidates.push(...this.collectInjectionCandidates(arg, `${sourcePrefix}.arg${index}`))
        }

        let patchedCount = 0
        for (const candidate of candidates) {
            if (this.tryPatchRuntimeSessionStart(candidate.target, profile, candidate.source)) {
                patchedCount++
            }
        }

        if (patchedCount) {
            pluginLog('ssh-proxy', 'runtime session start patched', {
                sourcePrefix,
                profileId: profile?.id ?? null,
                patchedCount,
            })
        }
    }

    private tryPatchRuntimeSessionStart (target: any, expectedProfile: any, source: string): boolean {
        if (!target || typeof target !== 'object') {
            return false
        }

        const resolvedProfile = this.extractSSHProfile(target) ?? target?.profile ?? expectedProfile
        if (!resolvedProfile || typeof resolvedProfile !== 'object') {
            return false
        }
        if (expectedProfile?.id && resolvedProfile?.id && expectedProfile.id !== resolvedProfile.id) {
            return false
        }

        let patched = false
        patched = this.wrapRuntimeStartTarget(target, resolvedProfile, source, 'instance') || patched

        const prototype = Object.getPrototypeOf(target)
        if (prototype && typeof prototype === 'object') {
            patched = this.wrapRuntimeStartTarget(prototype, resolvedProfile, `${source}.prototype`, 'prototype') || patched
        }

        const nestedRuntimeTargets = [
            { value: target?.ssh, label: 'ssh' },
            { value: target?.shell, label: 'shell' },
            { value: target?.session, label: 'session' },
            { value: target?.connection, label: 'connection' },
        ]

        for (const nested of nestedRuntimeTargets) {
            if (!nested.value || typeof nested.value !== 'object') {
                continue
            }
            patched = this.wrapRuntimeStartTarget(nested.value, resolvedProfile, `${source}.${nested.label}`, 'nested-instance') || patched

            const nestedPrototype = Object.getPrototypeOf(nested.value)
            if (nestedPrototype && typeof nestedPrototype === 'object') {
                patched = this.wrapRuntimeStartTarget(nestedPrototype, resolvedProfile, `${source}.${nested.label}.prototype`, 'nested-prototype') || patched
            }
        }

        return patched
    }

    private wrapRuntimeStartTarget (holder: any, resolvedProfile: any, source: string, patchKind: string): boolean {
        if (!holder || typeof holder !== 'object') {
            return false
        }
        if (typeof holder.start !== 'function') {
            return false
        }

        const seenSet = patchKind.includes('prototype') ? this.patchedRuntimePrototypes : this.patchedRuntimeStarts
        if (seenSet.has(holder)) {
            return false
        }

        const original = holder.start
        const self = this
        holder.start = async function (...args: any[]) {
            const profile = self.extractSSHProfile(this) ?? self.findSSHProfileArg(args) ?? resolvedProfile
            const proxy = self.getProxyForProfile(profile)

            if (proxy && profile) {
                self.applyProfileProxy(profile, proxy, `${source}.runtime-start`)
                self.injectSock(args, profile, null, this, `${source}.runtime-start`)
            }

            return await self.runWithActiveProfile(profile, () => original.apply(this, args))
        }

        seenSet.add(holder)
        pluginLog('ssh-proxy', 'runtime session start wrapper installed', {
            source,
            patchKind,
            profileId: resolvedProfile?.id ?? null,
        })
        return true
    }

    private getSSHServicePatchTarget (): any | null {
        const sshModule = this.tryRequire('tabby-ssh')
        if (!sshModule) {
            pluginLog('ssh-proxy', 'tabby-ssh module not available after require')
            return null
        }

        const exportKeys = Object.keys(sshModule)

        const sshService = sshModule?.SSHService
        if (sshService?.prototype) {
            return sshService.prototype
        }

        for (const key of exportKeys) {
            const candidate = sshModule[key]
            if (!candidate?.prototype) {
                continue
            }

            const prototypeMethods = Object.getOwnPropertyNames(candidate.prototype)

            if (prototypeMethods.some(method => [
                'connect',
                'openConnection',
                'startSession',
                'createConnection',
                'setupOneSession',
                'initializeSessionMaybeMultiplex',
                'initializeSession',
            ].includes(method))) {
                pluginLog('ssh-proxy', 'using fallback tabby-ssh export prototype', { key, prototypeMethods })
                return candidate.prototype
            }
        }

        pluginLog('ssh-proxy', 'tabby-ssh module resolved but no usable prototype found')
        return null
    }

    private patchRusshTransport (): void {
        if (SSHProxyService.transportPatched) {
            pluginLog('ssh-proxy', 'russh transport patch skipped: already patched')
            return
        }

        const russhModule = this.tryRequire('russh')
        const transport = russhModule?.SshTransport
        if (!transport) {
            pluginLog('ssh-proxy', 'russh transport patch skipped: SshTransport not found')
            return
        }

        const originalNewSocket = typeof transport.newSocket === 'function' ? transport.newSocket.bind(transport) : null
        const originalNewSocksProxy = typeof transport.newSocksProxy === 'function' ? transport.newSocksProxy.bind(transport) : null
        const originalNewHttpProxy = typeof transport.newHttpProxy === 'function' ? transport.newHttpProxy.bind(transport) : null

        if (!originalNewSocket || !originalNewSocksProxy || !originalNewHttpProxy) {
            pluginLog('ssh-proxy', 'russh transport patch skipped: missing factory methods', {
                hasNewSocket: !!originalNewSocket,
                hasNewSocksProxy: !!originalNewSocksProxy,
                hasNewHttpProxy: !!originalNewHttpProxy,
            })
            return
        }

        const self = this

        const patchedMethods: string[] = []

        const newSocketWrapper = async (address: string, ...args: any[]) => {
            const profile = self.getActiveProfile()
            const proxy = self.getProxyForProfile(profile)
            const target = self.parseTransportAddress(address)

            if (proxy && target?.host) {
                if (proxy.protocol === 'socks5') {
                    return await originalNewSocksProxy(proxy.host, Number(proxy.port), target.host, target.port)
                }

                return await originalNewHttpProxy(proxy.host, Number(proxy.port), target.host, target.port)
            }

            return await originalNewSocket(address, ...args)
        }

        const newSocksProxyWrapper = async (proxyHost: string, proxyPort: number, host: string, port: number, ...args: any[]) => {
            const profile = self.getActiveProfile()
            const proxy = self.getProxyForProfile(profile)

            if (proxy && proxy.protocol === 'socks5') {
                return await originalNewSocksProxy(proxy.host, Number(proxy.port), host, port, ...args)
            }

            return await originalNewSocksProxy(proxyHost, proxyPort, host, port, ...args)
        }

        const newHttpProxyWrapper = async (proxyHost: string, proxyPort: number, host: string, port: number, ...args: any[]) => {
            const profile = self.getActiveProfile()
            const proxy = self.getProxyForProfile(profile)

            if (proxy && proxy.protocol === 'http-connect') {
                return await originalNewHttpProxy(proxy.host, Number(proxy.port), host, port, ...args)
            }

            return await originalNewHttpProxy(proxyHost, proxyPort, host, port, ...args)
        }

        if (this.tryOverrideTransportMethod(transport, 'newSocket', newSocketWrapper)) {
            patchedMethods.push('newSocket')
        }
        if (this.tryOverrideTransportMethod(transport, 'newSocksProxy', newSocksProxyWrapper)) {
            patchedMethods.push('newSocksProxy')
        }
        if (this.tryOverrideTransportMethod(transport, 'newHttpProxy', newHttpProxyWrapper)) {
            patchedMethods.push('newHttpProxy')
        }

        if (!patchedMethods.length) {
            pluginLog('ssh-proxy', 'russh transport patch skipped: all factory methods are readonly', {
                methods: ['newSocket', 'newSocksProxy', 'newHttpProxy'],
            })
            return
        }

        SSHProxyService.transportPatched = true
        pluginLog('ssh-proxy', 'russh transport patch complete', {
            methods: patchedMethods,
        })
    }

    private getActiveProfile (): any | null {
        for (let index = this.activeProfiles.length - 1; index >= 0; index--) {
            const profile = this.activeProfiles[index]
            if (profile && typeof profile === 'object') {
                return profile
            }
        }
        return null
    }

    private async runWithActiveProfile<T> (profile: any, fn: () => Promise<T>): Promise<T> {
        if (!profile || typeof profile !== 'object') {
            return await fn()
        }

        this.activeProfiles.push(profile)
        try {
            return await fn()
        } finally {
            const lastIndex = this.activeProfiles.lastIndexOf(profile)
            if (lastIndex >= 0) {
                this.activeProfiles.splice(lastIndex, 1)
            }
        }
    }

    private prepareSetupOneSessionProfile (context: any, args: any[], fallbackProfile: any): any {
        const profileArgIndex = args.findIndex(arg => arg && typeof arg === 'object' && this.extractSSHProfile(arg))
        const originalProfile = profileArgIndex >= 0 ? args[profileArgIndex] : fallbackProfile
        const proxiedProfile = this.getConfigProxyForRuntimeProfile(context, originalProfile)

        if (!proxiedProfile || proxiedProfile === originalProfile) {
            this.applyProfileProxy(originalProfile, this.getProxyConfig(), 'setupOneSession.prepared-profile')
            return originalProfile
        }

        this.applyProfileProxy(proxiedProfile, this.getProxyConfig(), 'setupOneSession.prepared-config-proxy')
        args[profileArgIndex] = proxiedProfile
        return proxiedProfile
    }

    private getConfigProxyForRuntimeProfile (context: any, profile: any): any {
        const profilesService = context?.profilesService
        if (!profilesService || typeof profilesService.getConfigProxyForProfile !== 'function') {
            pluginLog('ssh-proxy', 'runtime ConfigProxy lookup skipped: profilesService unavailable')
            return profile
        }

        try {
            const result = profilesService.getConfigProxyForProfile(profile)
            return result ?? profile
        } catch (error) {
            pluginError('ssh-proxy', 'runtime ConfigProxy lookup failed', {
                profileId: profile?.id ?? null,
                error,
            })
            return profile
        }
    }

    private tryOverrideTransportMethod (transport: any, key: string, wrapper: any): boolean {
        const descriptor = Object.getOwnPropertyDescriptor(transport, key)

        try {
            transport[key] = wrapper
            return true
        } catch (error: any) {
        }

        if (!descriptor?.configurable) {
            pluginLog('ssh-proxy', 'russh transport method patch skipped: non-configurable', { key })
            return false
        }

        try {
            Object.defineProperty(transport, key, {
                configurable: true,
                enumerable: descriptor?.enumerable ?? true,
                writable: true,
                value: wrapper,
            })
            return true
        } catch (error: any) {
            return false
        }
    }

    private parseTransportAddress (address: string): { host: string, port: number } | null {
        if (!address || typeof address !== 'string') {
            return null
        }

        const trimmed = address.trim()
        const ipv6Match = /^\[([^\]]+)\]:(\d+)$/.exec(trimmed)
        if (ipv6Match) {
            return {
                host: ipv6Match[1],
                port: Number(ipv6Match[2]),
            }
        }

        const separatorIndex = trimmed.lastIndexOf(':')
        if (separatorIndex <= 0) {
            return null
        }

        return {
            host: trimmed.slice(0, separatorIndex),
            port: Number(trimmed.slice(separatorIndex + 1)) || 22,
        }
    }

    private tryRequire (moduleName: string): any | null {
        try {
            const result = require(moduleName)
            return result
        } catch (error) {
            pluginError('ssh-proxy', 'require failed', { moduleName, via: 'local', error })
        }

        try {
            const result = (globalThis as any)?.require?.(moduleName) ?? null
            return result
        } catch (error) {
            pluginError('ssh-proxy', 'require failed', { moduleName, via: 'globalThis', error })
            return null
        }
    }

    private getProxyConfig (): ProxyManagerConfig {
        return {
            protocol: this.config.store?.proxyManager?.protocol === 'http-connect' ? 'http-connect' : 'socks5',
            host: this.config.store?.proxyManager?.host || '127.0.0.1',
            port: String(this.config.store?.proxyManager?.port || '1080'),
            selectedProfileIds: Array.isArray(this.config.store?.proxyManager?.selectedProfileIds)
                ? this.config.store.proxyManager.selectedProfileIds
                : [],
        }
    }

    private getProxyForProfile (profile: any): ProxyManagerConfig | null {
        const config = this.getProxyConfig()
        const profileId = profile?.id
        if (!profileId) {
            return null
        }

        if (!config.selectedProfileIds.includes(profileId)) {
            return null
        }

        return config
    }

    private resolveHost (profile: any): string | null {
        return (
            profile?.options?.host ||
            profile?.host ||
            profile?.config?.host ||
            profile?.ssh?.host ||
            null
        )
    }

    private resolvePort (profile: any): number {
        return Number(
            profile?.options?.port ||
            profile?.port ||
            profile?.config?.port ||
            profile?.ssh?.port ||
            22,
        )
    }

    private findSSHProfileArg (args: any[]): any | null {
        for (const arg of args) {
            const profile = this.extractSSHProfile(arg)
            if (profile) {
                return profile
            }
        }

        return null
    }

    private extractSSHProfile (value: any): any | null {
        if (!value || typeof value !== 'object') {
            return null
        }

        if (
            value.type === 'ssh' ||
            value?.options?.host ||
            value?.host ||
            value?.config?.host ||
            value?.ssh?.host
        ) {
            return value
        }

        const nestedCandidates = [
            value.profile,
            value.tab,
            value.tab?.profile,
            value.session,
            value.session?.profile,
            value.connection,
            value.connection?.profile,
            value.frontend,
            value.frontend?.profile,
            value.frontend?.session,
            value.frontend?.session?.profile,
            value.frontendSession,
            value.frontendSession?.profile,
            value.activeSession,
            value.activeSession?.profile,
        ]

        for (const candidate of nestedCandidates) {
            if (
                candidate &&
                typeof candidate === 'object' &&
                (
                    candidate.type === 'ssh' ||
                    candidate?.options?.host ||
                    candidate?.host ||
                    candidate?.config?.host ||
                    candidate?.ssh?.host
                )
            ) {
                return candidate
            }
        }

        return null
    }

    private injectSock (args: any[], profile: any, sock: any, context?: any, sourcePrefix = 'runtime'): void {
        const candidates = this.collectInjectionCandidates(profile, 'profile')

        if (context && typeof context === 'object') {
            candidates.push(...this.collectInjectionCandidates(context, `${sourcePrefix}.this`))
        }

        for (let index = 0; index < args.length; index++) {
            const arg = args[index]
            if (!arg || typeof arg !== 'object') {
                continue
            }

            candidates.push(...this.collectInjectionCandidates(arg, `${sourcePrefix}.arg${index}`))
        }

        let injectedCount = 0
        const seenTargets = new WeakSet<object>()

        for (const candidate of candidates) {
            if (!candidate.target || typeof candidate.target !== 'object') {
                continue
            }
            if (seenTargets.has(candidate.target)) {
                continue
            }
            seenTargets.add(candidate.target)

            if (this.tryInjectIntoTarget(candidate.target, sock, candidate.source)) {
                injectedCount++
            }
        }

        if (!injectedCount) {
            profile.sock = sock
            return
        }
    }

    private collectInjectionCandidates (root: any, source: string): Array<{ target: any, source: string }> {
        if (!root || typeof root !== 'object') {
            return []
        }

        const results: Array<{ target: any, source: string }> = []
        const queue: Array<{ value: any, source: string, depth: number }> = [{ value: root, source, depth: 0 }]
        const visited = new WeakSet<object>()
        const nestedKeys = [
            'profile',
            'tab',
            'session',
            'connection',
            'connections',
            'frontend',
            'frontendSession',
            'activeSession',
            'ssh',
            'config',
            'options',
            'sshOptions',
            'sessionOptions',
            'connectionOptions',
            'sshConfig',
            'connectionConfig',
            'connectConfig',
            'cfg',
            'client',
            'socket',
            'transport',
            'owner',
            'parent',
        ]

        while (queue.length) {
            const current = queue.shift()!
            const value = current.value

            if (!value || typeof value !== 'object') {
                continue
            }
            if (visited.has(value)) {
                continue
            }
            visited.add(value)
            results.push({ target: value, source: current.source })

            if (current.depth >= 4) {
                continue
            }

            for (const key of nestedKeys) {
                const nested = value[key]
                if (Array.isArray(nested)) {
                    for (let index = 0; index < nested.length && index < 5; index++) {
                        queue.push({ value: nested[index], source: `${current.source}.${key}[${index}]`, depth: current.depth + 1 })
                    }
                    continue
                }

                if (nested && typeof nested === 'object') {
                    queue.push({ value: nested, source: `${current.source}.${key}`, depth: current.depth + 1 })
                }
            }
        }

        return results
    }

    private tryInjectIntoTarget (target: any, sock: any, source: string): boolean {
        if (!target || typeof target !== 'object') {
            return false
        }

        const proxy = this.getProxyConfig()
        const objectPaths: Array<{ key: string, label: string }> = [
            { key: 'options', label: 'options' },
            { key: 'config', label: 'config' },
            { key: 'ssh', label: 'ssh' },
            { key: 'sshOptions', label: 'sshOptions' },
            { key: 'sessionOptions', label: 'sessionOptions' },
            { key: 'connectionOptions', label: 'connectionOptions' },
            { key: 'sshConfig', label: 'sshConfig' },
            { key: 'connectionConfig', label: 'connectionConfig' },
            { key: 'connectConfig', label: 'connectConfig' },
            { key: 'cfg', label: 'cfg' },
        ]

        let injected = false

        for (const path of objectPaths) {
            const container = target?.[path.key]
            if (!container || typeof container !== 'object') {
                continue
            }

            this.applyProxySettings(container, sock, proxy, `${source}.${path.label}`)
            injected = true
        }

        if ('sock' in target || target.type === 'ssh' || target?.host || target?.profile || target?.connection || target?.session) {
            this.applyProxySettings(target, sock, proxy, `${source}.target`)
            injected = true
        }

        if (target?.socket && typeof target.socket === 'object' && 'sock' in target.socket) {
            target.socket.sock = sock
            injected = true
        }

        if (target?.client && typeof target.client === 'object' && 'sock' in target.client) {
            target.client.sock = sock
            injected = true
        }

        if (injected) {
            return true
        }

        return false
    }

    private applyProfileProxy (profile: any, proxy: ProxyManagerConfig, source: string): void {
        if (!profile || typeof profile !== 'object') {
            return
        }

        this.applyProxySettings(profile?.options ?? profile, null, proxy, `${source}.options`)

        if (profile?.options && profile.options !== profile) {
            this.trySetProperty(profile, 'options', profile.options, `${source}.profile-options-ref`)
        }

        this.tryInjectIntoTarget(profile, null, source)
    }

    private applyProxySettings (target: any, sock: any, proxy: ProxyManagerConfig, source: string): void {
        if (!target || typeof target !== 'object') {
            return
        }

        if (sock) {
            target.sock = sock
        }

        if (proxy.protocol === 'socks5') {
            this.trySetProperty(target, 'socksProxyHost', proxy.host, source)
            this.trySetProperty(target, 'socksProxyPort', Number(proxy.port), source)
            this.trySetProperty(target, 'httpProxyHost', undefined, source)
            this.trySetProperty(target, 'httpProxyPort', undefined, source)
        } else {
            this.trySetProperty(target, 'httpProxyHost', proxy.host, source)
            this.trySetProperty(target, 'httpProxyPort', Number(proxy.port), source)
            this.trySetProperty(target, 'socksProxyHost', undefined, source)
            this.trySetProperty(target, 'socksProxyPort', undefined, source)
        }

        this.tryClearProxyCommand(target, source)
    }

    private trySetProperty (target: any, key: string, value: any, source: string): void {
        if (!target || typeof target !== 'object') {
            return
        }

        try {
            target[key] = value
            return
        } catch (error: any) {
        }

        try {
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: true,
                writable: true,
                value,
            })
        } catch (error: any) {
        }
    }

    private tryClearProxyCommand (target: any, source: string): void {
        if (!target || typeof target !== 'object' || !('proxyCommand' in target)) {
            return
        }

        const previousValue = target.proxyCommand

        try {
            target.proxyCommand = undefined
        } catch (error: any) {
        }

        try {
            delete target.proxyCommand
        } catch (error: any) {
        }
    }
}
