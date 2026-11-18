import { Inject, Injectable } from '@angular/core'
import { AppService, ConfigService, ProfilesService } from 'tabby-core'
import { SSHTabComponent } from 'tabby-ssh'
import { readRouting, resolveRoute, sessionProfile, pathLabel, Route } from './routing'
import { withProxySession } from './proxy-session'
import { usesAuthentication } from './types'

@Injectable()
export class SSHProxyService {
    readonly recent = new Map<string, { path: string, source: string, time: string }>()
    private readonly once = new WeakMap<object, Route>()
    readonly supported = typeof SSHTabComponent?.prototype.setupOneSession === 'function'
        && typeof SSHTabComponent?.prototype.initializeSession === 'function'

    constructor (
        @Inject(ConfigService) private config: ConfigService,
        @Inject(ProfilesService) private profiles: ProfilesService,
        @Inject(AppService) private app: AppService,
    ) {
        if (!this.supported) { return }
        const prototype = SSHTabComponent.prototype
        const setup = prototype.setupOneSession
        const initialize = prototype.initializeSession
        const service = this

        prototype.initializeSession = async function (...args: any[]) {
            const profile = this.profile
            try {
                return await initialize.apply(this, args)
            } finally {
                // Tabby can retry during initialization. Reconnects start a new decision.
                service.once.delete(profile)
            }
        }
        prototype.setupOneSession = async function (injector: any, profile: any, ...args: any[]) {
            if (!profile?.id || profile.type !== 'ssh') { return setup.call(this, injector, profile, ...args) }
            const store = service.config.store
            const temporary = service.once.get(profile)
            const route = temporary || resolveRoute(readRouting(store.proxyManager), profile, store)
            const runtime = sessionProfile(profile, route)
            // "Connect once" should really exercise the chosen path, even when a session is reusable.
            if (temporary) { args[0] = false }
            const authenticated = route.preset && usesAuthentication(route.preset)
            const session = authenticated
                ? await withProxySession(route.preset!, runtime, local => setup.call(this, injector, local, false))
                : await setup.call(this, injector, runtime, ...args)
            if (session?.profile?.options) {
                service.recent.set(profile.id, {
                    path: pathLabel(authenticated ? runtime.options : session.profile.options, route.preset),
                    source: route.source, time: new Date().toLocaleTimeString(),
                })
            }
            return session
        }
    }

    async openOnce (profile: any, route: Route): Promise<void> {
        if (!this.supported) { throw new Error('此 Tabby 版本缺少 SSH 会话入口') }
        const params = await this.profiles.newTabParametersForProfile(profile)
        if (!params?.inputs?.profile) { throw new Error('无法创建 SSH 标签页') }
        // Parameters contain a fresh resolved profile for this tab, even for simultaneous launches.
        this.once.set(params.inputs.profile, { ...route, source: '仅本次', preset: route.preset && { ...route.preset } })
        try {
            this.app.openNewTab(params)
        } catch (error) {
            this.once.delete(params.inputs.profile)
            throw error
        }
    }
}
