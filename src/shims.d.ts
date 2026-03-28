declare module '@angular/core' {
    export function Injectable (_options?: any): ClassDecorator
    export function NgModule (_metadata: any): ClassDecorator
    export function Component (_metadata: any): ClassDecorator
}

declare module '@angular/common' {
    export class CommonModule {}
}

declare module '@angular/forms' {
    export class FormsModule {}
}

declare module 'tabby-core' {
    export class ConfigProvider {
        defaults?: any
        platformDefaults?: any
    }

    export class ConfigService {
        store: any
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
    export class SSHService {
        connect? (...args: any[]): any
        openConnection? (...args: any[]): any
        startSession? (...args: any[]): any
        createConnection? (...args: any[]): any
        getNewConnectionConfig? (...args: any[]): any
        buildConnectionConfig? (...args: any[]): any
        makeConnectionConfig? (...args: any[]): any
        getConnectionConfig? (...args: any[]): any
        prepareConnectionConfig? (...args: any[]): any
        getConfig? (...args: any[]): any
    }
}

declare module 'ssh2' {
    export class Client {
        connect (config: any): any
    }
}
