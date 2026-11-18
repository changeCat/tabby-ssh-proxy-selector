declare module '@angular/core' {
    export function Inject (token: any): ParameterDecorator
    export function Injectable (_options?: any): ClassDecorator
    export function NgModule (_metadata: any): ClassDecorator
    export function Component (_metadata: any): ClassDecorator
    export function Directive (_metadata: any): ClassDecorator
    export class ElementRef<T> { nativeElement: T }
    export class NgZone { runOutsideAngular<T> (callback: () => T): T }
}

declare module '@angular/common' {
    export class CommonModule {}
}

declare module '@angular/forms' {
    export class FormsModule {}
}

declare module 'tabby-core' {
    export class ProfilesService {
        newTabParametersForProfile (profile: any): Promise<any>
        getConfigProxyForProfile (profile: any): any
    }
    export class AppService {
        openNewTab (params: any): any
    }
    export class ConfigProvider {
        defaults?: any
        platformDefaults?: any
    }

    export class ConfigService {
        store: any
        readonly changed$: { subscribe (next: () => void): { unsubscribe (): void } }
        save (): void | Promise<void>
    }

    export class LogService {
        info (...args: any[]): void
        warn (...args: any[]): void
        error (...args: any[]): void
    }
}

declare module 'tabby-settings' {
    export class SettingsTabProvider {
        id: string
        icon?: string
        title?: string
        getComponentType? (): any
    }
}

declare module 'tabby-ssh' {
    export class SSHTabComponent {
        profile: any
        setupOneSession (injector: any, profile: any, multiplex?: boolean): Promise<any>
        initializeSession (): Promise<void>
    }
}
