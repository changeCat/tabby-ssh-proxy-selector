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
                <div class="list-group" style="max-height: 420px; overflow-y: auto;">
                    <label class="list-group-item d-flex align-items-center" *ngFor="let profile of sshProfiles">
                        <input
                            type="checkbox"
                            class="me-2"
                            [checked]="selectedProfileIds.has(profile.id)"
                            (change)="toggleProfile(profile.id)">
                        <span>{{ profile.name }} <small class="text-muted">({{ profile.options?.host || 'unknown-host' }})</small></span>
                    </label>
                </div>
                <div *ngIf="sshProfiles.length === 0" class="text-muted mt-2">
                    没有找到任何 SSH 配置。
                </div>
            </div>

            <div class="mt-2">
                <button class="btn btn-primary" (click)="save()">保存并应用</button>
            </div>
        </div>
    `,
})
export class ProxyManagerSettingsComponent {
    protocol: ProxyProtocol = 'socks5'
    host = '127.0.0.1'
    port = '1080'
    sshProfiles: any[] = []
    selectedProfileIds = new Set<string>()

    constructor (
        private config: ConfigService,
    ) {
        const saved = this.config.store?.proxyManager || {}
        this.protocol = this.normalizeProtocol(saved.protocol)
        this.host = saved.host || '127.0.0.1'
        this.port = String(saved.port || '1080')
        this.loadProfiles()
    }

    normalizeProtocol (value: unknown): ProxyProtocol {
        return value === 'http-connect' ? 'http-connect' : 'socks5'
    }

    loadProfiles (): void {
        const profiles = this.config.store?.profiles || []
        this.sshProfiles = profiles.filter((profile: any) => profile.type === 'ssh')

        const selectedIds = Array.isArray(this.config.store?.proxyManager?.selectedProfileIds)
            ? this.config.store.proxyManager.selectedProfileIds
            : []

        this.selectedProfileIds = new Set(selectedIds)
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
    }
}
