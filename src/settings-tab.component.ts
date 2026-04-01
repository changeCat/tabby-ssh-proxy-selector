import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { pluginLog } from './logger'
import { ProxyProtocol } from './types'

@Component({
    selector: 'proxy-manager-settings',
    template: `
        <div class="d-flex flex-column h-100 p-3">
            <h3 class="mb-3">SSH 代理批量管理</h3>

            <div class="row g-3 mb-3">
                <div class="col-md-4">
                    <label>代理协议</label>
                    <select class="form-control" [(ngModel)]="protocol">
                        <option value="socks5">SOCKS5</option>
                        <option value="http-connect">HTTP CONNECT</option>
                    </select>
                </div>

                <div class="col-md-4">
                    <label>代理 IP</label>
                    <input
                        class="form-control"
                        [(ngModel)]="host"
                        placeholder="例如: 127.0.0.1">
                </div>

                <div class="col-md-4">
                    <label>代理端口</label>
                    <input
                        class="form-control"
                        [(ngModel)]="port"
                        placeholder="例如: 1080">
                </div>
            </div>

            <div class="form-group mb-3">
                <label>选择要使用代理的 SSH 连接</label>
                <div class="border rounded" style="max-height: 420px; overflow-y: auto;">
                    <ng-container *ngFor="let group of groupedSSHProfiles">
                        <div class="px-3 py-2 bg-light border-bottom fw-bold">{{ group.name }}</div>
                        <div class="list-group list-group-flush">
                            <label class="list-group-item d-flex align-items-center" *ngFor="let profile of group.profiles">
                                <input
                                    type="checkbox"
                                    class="me-2"
                                    [checked]="selectedProfileIds.has(profile.id)"
                                    (change)="toggleProfile(profile.id)">
                                <span>{{ profile.name }} <small class="text-muted">({{ profile.options?.host || 'unknown-host' }})</small></span>
                            </label>
                        </div>
                    </ng-container>
                </div>
                <div *ngIf="sshProfiles.length === 0" class="text-muted mt-2">
                    没有找到任何 SSH 配置。
                </div>
            </div>

            <div class="mt-2 d-flex align-items-center gap-3">
                <button class="btn btn-primary" (click)="save()">保存并应用</button>
                <div *ngIf="saveSuccessVisible" class="alert alert-success py-1 px-3 mb-0">
                    保存成功
                </div>
            </div>
        </div>
    `,
})
export class ProxyManagerSettingsComponent {
    protocol: ProxyProtocol = 'socks5'
    host = '127.0.0.1'
    port = '1080'
    sshProfiles: any[] = []
    groupedSSHProfiles: Array<{ name: string, profiles: any[] }> = []
    selectedProfileIds = new Set<string>()
    saveSuccessVisible = false
    private readonly defaultGroupName = '未分组'
    private saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

    constructor (
        private config: ConfigService,
    ) {
        const saved = this.config.store?.proxyManager || {}
        this.protocol = this.normalizeProtocol(saved.protocol)
        this.host = saved.host || '127.0.0.1'
        this.port = String(saved.port || '1080')
        this.loadProfiles()
    }

    ngOnDestroy (): void {
        this.clearSaveSuccessTimer()
    }

    normalizeProtocol (value: unknown): ProxyProtocol {
        return value === 'http-connect' ? 'http-connect' : 'socks5'
    }

    loadProfiles (): void {
        const profiles = this.config.store?.profiles || []
        this.sshProfiles = profiles.filter((profile: any) => profile.type === 'ssh')
        this.groupedSSHProfiles = this.groupProfiles(this.sshProfiles)

        const selectedIds = Array.isArray(this.config.store?.proxyManager?.selectedProfileIds)
            ? this.config.store.proxyManager.selectedProfileIds
            : []

        this.selectedProfileIds = new Set(selectedIds)
    }

    groupProfiles (profiles: any[]): Array<{ name: string, profiles: any[] }> {
        const groups = new Map<string, any[]>()
        const groupNameLookup = this.buildGroupNameLookup(profiles)

        for (const profile of profiles) {
            const groupName = this.getProfileGroupName(profile, groupNameLookup)
            const existingProfiles = groups.get(groupName)

            if (existingProfiles) {
                existingProfiles.push(profile)
                continue
            }

            groups.set(groupName, [profile])
        }

        return Array.from(groups.entries()).map(([name, groupedProfiles]) => ({
            name,
            profiles: groupedProfiles,
        }))
    }

    getProfileGroupName (profile: any, groupNameLookup: Map<string, string>): string {
        const candidatePaths = [
            profile.groupPath,
            profile.groupingPath,
            profile.grouping,
            profile.group,
            profile.options?.groupPath,
            profile.options?.groupingPath,
            profile.options?.grouping,
            profile.options?.group,
        ]

        for (const candidate of candidatePaths) {
            const resolvedPath = this.resolveGroupPath(candidate, groupNameLookup)
            if (resolvedPath) {
                return resolvedPath
            }
        }

        return this.defaultGroupName
    }

    buildGroupNameLookup (profiles: any[]): Map<string, string> {
        const lookup = new Map<string, string>()
        const sources = [
            this.config.store?.profileGroups,
            this.config.store?.groups,
        ]

        for (const source of sources) {
            this.collectGroupNames(source, lookup)
        }

        for (const profile of profiles) {
            this.collectGroupNames(profile.grouping ?? profile.groupPath ?? profile.group ?? profile.options?.grouping ?? profile.options?.groupPath ?? profile.options?.group, lookup)
        }

        return lookup
    }

    collectGroupNames (source: any, lookup: Map<string, string>, seen = new WeakSet<object>()): void {
        if (!source) {
            return
        }

        if (Array.isArray(source)) {
            for (const item of source) {
                this.collectGroupNames(item, lookup, seen)
            }
            return
        }

        if (typeof source !== 'object') {
            return
        }

        if (seen.has(source)) {
            return
        }
        seen.add(source)

        const isLikelyProfile = typeof source.type === 'string' || !!source.options
        const isLikelyGroup = !!source.groupId || !!source.groupName || !!source.groups || !!source.children || !!source.items || /group/i.test(String(source.type ?? ''))

        if (isLikelyGroup && !isLikelyProfile) {
            const groupIdCandidates = [source.id, source.group, source.groupId, source.uid, source.uuid]
            const groupNameCandidates = [source.groupName, source.name, source.title, source.label, source.displayName]
            const resolvedName = groupNameCandidates
                .map(value => this.normalizeGroupPart(value, lookup))
                .find(Boolean)

            if (resolvedName) {
                for (const candidate of groupIdCandidates) {
                    const normalizedId = this.normalizeGroupKey(candidate)
                    if (normalizedId) {
                        lookup.set(normalizedId, resolvedName)
                    }
                }
            }
        }

        for (const value of Object.values(source)) {
            this.collectGroupNames(value, lookup, seen)
        }
    }

    resolveGroupPath (value: any, groupNameLookup: Map<string, string>): string | null {
        if (Array.isArray(value)) {
            const pathParts = value
                .map(item => this.normalizeGroupPart(item, groupNameLookup))
                .filter((item): item is string => !!item)

            if (pathParts.length) {
                return pathParts.join(' / ')
            }

            return null
        }

        return this.normalizeGroupPart(value, groupNameLookup)
    }

    normalizeGroupPart (value: any, groupNameLookup: Map<string, string>): string | null {
        if (!value) {
            return null
        }

        if (typeof value === 'string') {
            const normalizedValue = value.trim()
            if (!normalizedValue) {
                return null
            }

            return groupNameLookup.get(normalizedValue) ?? (this.looksLikeOpaqueGroupId(normalizedValue) ? null : normalizedValue)
        }

        if (typeof value !== 'object') {
            return null
        }

        const directName = [value.name, value.title, value.label, value.displayName]
            .map(candidate => this.normalizeGroupPart(candidate, groupNameLookup))
            .find(Boolean)
        if (directName) {
            return directName
        }

        const path = this.resolveGroupPath(value.path ?? value.groupPath ?? value.groupingPath ?? value.groups, groupNameLookup)
        if (path) {
            return path
        }

        const keyCandidates = [value.id, value.group, value.groupId, value.uid, value.uuid]
        for (const candidate of keyCandidates) {
            const normalizedKey = this.normalizeGroupKey(candidate)
            if (!normalizedKey) {
                continue
            }

            const matchedName = groupNameLookup.get(normalizedKey)
            if (matchedName) {
                return matchedName
            }
        }

        return null
    }

    normalizeGroupKey (value: any): string | null {
        return typeof value === 'string' ? value.trim() || null : null
    }

    looksLikeOpaqueGroupId (value: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    }

    clearSaveSuccessTimer (): void {
        if (this.saveSuccessTimer) {
            clearTimeout(this.saveSuccessTimer)
            this.saveSuccessTimer = null
        }
    }

    toggleProfile (id: string): void {
        if (this.selectedProfileIds.has(id)) {
            this.selectedProfileIds.delete(id)
            return
        }

        this.selectedProfileIds.add(id)
    }

    save (): void {
        if (!this.config.store.proxyManager) {
            this.config.store.proxyManager = {}
        }

        this.config.store.proxyManager.protocol = this.protocol
        this.config.store.proxyManager.host = this.host.trim()
        this.config.store.proxyManager.port = this.port.trim()
        this.config.store.proxyManager.selectedProfileIds = Array.from(this.selectedProfileIds)

        const profiles = this.config.store?.profiles || []
        for (const profile of profiles) {
            if (profile.type !== 'ssh') {
                continue
            }

            if (!profile.options) {
                profile.options = {}
            }

            delete profile.options.proxyCommand
        }

        pluginLog('settings', 'proxy manager config saved', {
            selectedProfileCount: this.config.store.proxyManager.selectedProfileIds.length,
            protocol: this.config.store.proxyManager.protocol,
        })
        this.config.save()
        this.showSaveSuccess()
    }

    showSaveSuccess (): void {
        this.saveSuccessVisible = true
        this.clearSaveSuccessTimer()
        this.saveSuccessTimer = setTimeout(() => {
            this.saveSuccessVisible = false
            this.saveSuccessTimer = null
        }, 3000)
    }
}
