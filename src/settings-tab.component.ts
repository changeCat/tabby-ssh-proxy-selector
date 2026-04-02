import { Component } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { pluginLog } from './logger'
import { ProxyProtocol } from './types'

@Component({
    selector: 'proxy-manager-settings',
    template: `
        <div class="settings-root d-flex flex-column h-100 p-3" style="width: 100%; max-width: 100%; overflow-x: hidden; box-sizing: border-box;">
            <h3 class="mb-3">SSH 代理批量管理</h3>

            <div class="proxy-form-row row g-3 mb-3 mx-0">
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
                <div class="profile-list-shell border rounded">
                    <div class="profile-list-container">
                    <ng-container *ngFor="let group of groupedSSHProfiles">
                        <div class="group-header px-3 py-2 bg-light border-bottom d-flex align-items-center justify-content-between gap-2">
                            <span class="fw-bold">{{ group.name }}</span>
                            <label class="d-inline-flex align-items-center gap-2 mb-0 small text-muted">
                                <input
                                    type="checkbox"
                                    [checked]="isGroupFullySelected(group.profiles)"
                                    [indeterminate]="isGroupPartiallySelected(group.profiles)"
                                    (change)="toggleGroup(group.profiles)">
                                <span>全选本组</span>
                            </label>
                        </div>
                        <div class="list-group list-group-flush profile-group-list">
                            <label
                                class="list-group-item d-flex align-items-center profile-item"
                                title="{{ profile.name }}"
                                *ngFor="let profile of group.profiles"
                                [class.profile-item-selected]="selectedProfileIds.has(profile.id)">
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
    styles: [`
        :host {
            display: block;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
        }

        :host *,
        :host *::before,
        :host *::after {
            box-sizing: border-box;
        }

        .settings-root {
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
        }

        .proxy-form-row {
            margin-left: 0;
            margin-right: 0;
        }

        .proxy-form-row > [class*='col-'] {
            padding-left: 0.75rem;
            padding-right: 0.75rem;
        }

        .form-group,
        .profile-list-shell,
        .profile-list-container,
        .list-group,
        .profile-group-list,
        .group-header,
        .profile-item {
            width: 100%;
            max-width: 100%;
            min-width: 0;
        }

        .group-header {
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            row-gap: 0.5rem;
            overflow: hidden;
        }

        .group-header > span,
        .group-header > label {
            min-width: 0;
            max-width: 100%;
        }

        .profile-list-shell {
            overflow: hidden;
        }

        .profile-list-container {
            display: block;
            max-height: 420px;
            overflow-y: auto;
            overflow-x: hidden;
            overscroll-behavior-x: none;
            scrollbar-width: thin;
            padding-bottom: 1px;
        }

        .profile-list-container::-webkit-scrollbar:horizontal {
            height: 0 !important;
            display: none;
        }

        .profile-group-list {
            overflow-x: hidden;
        }

        .profile-item {
            position: relative;
            display: flex;
            cursor: pointer;
            min-width: 0;
            overflow: hidden;
            transition: background-color 0.18s ease;
        }

        .profile-item span {
            flex: 1 1 auto;
            min-width: 0;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .profile-item:hover {
            background-color: rgba(13, 110, 253, 0.18);
        }

        .profile-item::after {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            opacity: 0;
            box-shadow: inset 3px 0 0 rgba(13, 110, 253, 0.95);
            transition: opacity 0.18s ease;
        }

        .profile-item:hover::after {
            opacity: 1;
        }

        .profile-item-selected {
            background-color: rgba(13, 110, 253, 0.08);
        }

        .profile-item-selected:hover {
            background-color: rgba(13, 110, 253, 0.2);
        }
    `],
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
        const groupNameLookup = this.buildGroupNameLookup()

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
        const rawGroup = profile.group ?? profile.grouping ?? profile.groupPath ?? profile.options?.group
        const resolved = this.resolveGroupValue(rawGroup, groupNameLookup)
        return resolved || this.defaultGroupName
    }

    buildGroupNameLookup (): Map<string, string> {
        const lookup = new Map<string, string>()
        const groups = [
            ...(Array.isArray(this.config.store?.groups) ? this.config.store.groups : []),
            ...(Array.isArray(this.config.store?.profileGroups) ? this.config.store.profileGroups : []),
        ]

        for (const group of groups) {
            const id = typeof group?.id === 'string' ? group.id.trim() : ''
            const name = typeof group?.name === 'string' ? group.name.trim() : ''
            if (id && name) {
                lookup.set(id, name)
            }
        }

        return lookup
    }

    resolveGroupValue (value: any, groupNameLookup: Map<string, string>): string | null {
        if (Array.isArray(value)) {
            const path = value
                .map(item => this.resolveGroupValue(item, groupNameLookup))
                .filter((item): item is string => !!item)
                .join(' / ')
                .trim()

            return path || null
        }

        if (typeof value === 'string') {
            const normalizedValue = value.trim()
            if (!normalizedValue) {
                return null
            }

            return groupNameLookup.get(normalizedValue) ?? (this.looksLikeOpaqueGroupId(normalizedValue) ? null : normalizedValue)
        }

        if (!value || typeof value !== 'object') {
            return null
        }

        const directName = typeof value.name === 'string' ? value.name.trim() : ''
        if (directName) {
            return directName
        }

        const nestedPath = this.resolveGroupValue(value.path ?? value.groupPath ?? value.groupingPath, groupNameLookup)
        if (nestedPath) {
            return nestedPath
        }

        const id = typeof value.id === 'string' ? value.id.trim() : ''
        if (id) {
            return groupNameLookup.get(id) ?? null
        }

        return null
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

    isGroupFullySelected (profiles: any[]): boolean {
        return profiles.length > 0 && profiles.every(profile => this.selectedProfileIds.has(profile.id))
    }

    isGroupPartiallySelected (profiles: any[]): boolean {
        if (profiles.length === 0) {
            return false
        }

        const selectedCount = profiles.filter(profile => this.selectedProfileIds.has(profile.id)).length
        return selectedCount > 0 && selectedCount < profiles.length
    }

    toggleGroup (profiles: any[]): void {
        if (this.isGroupFullySelected(profiles)) {
            for (const profile of profiles) {
                this.selectedProfileIds.delete(profile.id)
            }
            return
        }

        for (const profile of profiles) {
            this.selectedProfileIds.add(profile.id)
        }
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
