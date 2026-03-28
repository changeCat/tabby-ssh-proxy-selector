import * as fs from 'fs'
import * as path from 'path'

const LOG_FILE_NAME = 'tabby-ssh-proxy-selector.log'

function resolveLogPath (): string | null {
    const candidates = [
        process.env.APPDATA,
        process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : null,
        process.cwd(),
    ].filter(Boolean) as string[]

    for (const base of candidates) {
        try {
            const tabbyDir = path.join(base, 'tabby')
            fs.mkdirSync(tabbyDir, { recursive: true })
            return path.join(tabbyDir, LOG_FILE_NAME)
        } catch {
            // ignore
        }
    }

    return null
}

export function pluginLog (scope: string, message: string, extra?: any): void {
    const logPath = resolveLogPath()
    if (!logPath) {
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
        fs.appendFileSync(logPath, `[${time}] [${scope}] ${message}${serializedExtra}\n`, 'utf8')
    } catch {
        // ignore
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
