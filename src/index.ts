import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ConfigProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { SSHProxySelectorConfigProvider } from './config'
import { ProxyManagerSettingsComponent } from './settings-tab.component'
import { ProxyManagerSettingsProvider } from './settings.provider'
import { SSHProxyService } from './ssh-proxy.service'

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
    ],
    declarations: [
        ProxyManagerSettingsComponent,
    ],
    providers: [
        {
            provide: ConfigProvider,
            useClass: SSHProxySelectorConfigProvider,
            multi: true,
        },
        {
            provide: SettingsTabProvider,
            useClass: ProxyManagerSettingsProvider,
            multi: true,
        },
        SSHProxyService,
    ],
})
export default class SSHProxySelectorModule {
    constructor (
        _service: SSHProxyService,
    ) {
        // 实例化服务以自动 patch SSHService
    }
}
