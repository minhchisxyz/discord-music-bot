import fs from 'fs'
import path from 'path'
import { Client } from 'discord.js'
import type { QueuesMap } from './types.js'

// Use project root directory (where package.json is)
const projectRoot = process.cwd()

const logsDir = path.join(projectRoot, 'logs')
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)

// Clear log files at startup
const logFilePath = path.join(logsDir, 'bot.log')
const skippedFilePath = path.join(logsDir, 'skipped_songs.log')
fs.writeFileSync(logFilePath, '')
fs.writeFileSync(skippedFilePath, '')

// Will be set by the main file
let clientRef: Client | null = null
let queuesRef: QueuesMap | null = null

export function setClientRef(client: Client): void {
    clientRef = client
}

export function setQueuesRef(queues: QueuesMap): void {
    queuesRef = queues
}

export function log(message: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    console.log(logMessage)
    fs.appendFileSync(logFilePath, logMessage)
}

export function logSkippedSong(title: string, guildName: string): void {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] Skipped ${title} in ${guildName}\n`
    fs.appendFileSync(skippedFilePath, logMessage)
}

export function logQueueSummary(): void {
    if (!queuesRef || !clientRef) {
        log('Queue summary unavailable - refs not set')
        return
    }
    let message = 'Current queue'
    queuesRef.forEach((queue, guildId) => {
        const guildName = clientRef!.guilds.cache.get(guildId)?.name || 'Unknown Server'
        message += `\n${guildName}: ${queue.length} songs`
    })
    log(message)
}

