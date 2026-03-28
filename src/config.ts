import { Injectable } from '@angular/core'
import { ConfigProvider } from 'tabby-core'

@Injectable()
export class SSHProxySelectorConfigProvider extends ConfigProvider {
    defaults = {
        proxyManager: {
            protocol: 'socks5',
            host: '127.0.0.1',
            port: '1080',
            selectedProfileIds: [],
        },
    }

    platformDefaults = {
        proxyManager: {
            protocol: 'socks5',
            host: '127.0.0.1',
            port: '1080',
            selectedProfileIds: [],
        },
    }
}
