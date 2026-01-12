import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logsDir = path.join(__dirname, '..', 'logs')
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir)

// Clear log files at startup
const logFilePath = path.join(logsDir, 'bot.log')
const skippedFilePath = path.join(logsDir, 'skipped_songs.log')
fs.writeFileSync(logFilePath, '')
fs.writeFileSync(skippedFilePath, '')

// Will be set by the main file
let clientRef = null
let queuesRef = null

function setClientRef(client) {
    clientRef = client
}

function setQueuesRef(queues) {
    queuesRef = queues
}

function log(message) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}\n`
    console.log(logMessage)
    fs.appendFileSync(logFilePath, logMessage)
}

function logSkippedSong(title, guildName) {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] Skipped ${title} in ${guildName}\n`
    fs.appendFileSync(skippedFilePath, logMessage)
}

function logQueueSummary() {
    if (!queuesRef || !clientRef) {
        log('Queue summary unavailable - refs not set')
        return
    }
    let message = 'Current queue'
    queuesRef.forEach((queue, guildId) => {
        const guildName = clientRef.guilds.cache.get(guildId)?.name || 'Unknown Server'
        message += `\n${guildName}: ${queue.length} songs`
    })
    log(message)
}

export {
    log,
    logSkippedSong,
    logQueueSummary,
    setClientRef,
    setQueuesRef,
}
