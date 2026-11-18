import * as fs from 'fs'
import { homedir } from 'os'
import * as path from 'path'

const LOG_FILE_NAME = 'tabby-ssh-proxy-selector.log'
let logPath: string | null = null

function resolveLogPath (): string | null {
    if (!logPath) {
        try {
            let base: string
            switch (process.platform) {
                case 'darwin':
                    base = path.join(homedir(), 'Library', 'Application Support')
                    break
                case 'win32':
                    base = process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming')
                    break
                default:
                    base = process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config')
            }
            const directory = path.join(base, 'tabby')
            fs.mkdirSync(directory, { recursive: true })
            logPath = path.join(directory, LOG_FILE_NAME)
        } catch {
            return null
        }
    }
    return logPath
}

export function pluginLog (scope: string, message: string, extra?: any): void {
    const destination = resolveLogPath()
    if (!destination) {
        return
    }

    const time = new Date().toISOString()
    let serializedExtra = ''

    if (extra !== undefined) {
        try {
            serializedExtra = ` ${JSON.stringify(extra)}`
        } catch {
            serializedExtra = ` ${String(extra)}`
        }
    }

    try {
        fs.appendFileSync(destination, `[${time}] [${scope}] ${message}${serializedExtra}\n`, 'utf8')
    } catch {
        logPath = null
    }
}

export function pluginError (scope: string, message: string, error: any): void {
    const normalized = error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
        }
        : error

    pluginLog(scope, message, normalized)
}

export function getPluginLogPath (): string {
    return resolveLogPath() || LOG_FILE_NAME
}
