import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ProxyManagerSettingsComponent } from './settings-tab.component'

@Injectable()
export class ProxyManagerSettingsProvider extends SettingsTabProvider {
    id = 'tabby-ssh-proxy-selector'
    icon = 'globe'
    title = 'SSH 代理管理'

    getComponentType (): any {
        return ProxyManagerSettingsComponent
    }
}
