import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js'
import dotenv from 'dotenv'

dotenv.config()

// Import modules
import { log, logQueueSummary, setClientRef, setQueuesRef } from './src/logger.js'
import { setDisconnectTimer } from './src/player.js'
import * as playerModule from './src/player.js'
import * as commandsModule from './src/commands.js'
import { MESSAGES } from './src/constants.js'

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
    ],
})

// Bot configuration
const prefix = 'c.'

// Allowed server IDs from environment variable
const allowedServerIds = process.env.ALLOWED_SERVER_IDS
    ? process.env.ALLOWED_SERVER_IDS.split(',').map(id => id.trim())
    : []

function isServerAllowed(guildId) {
    // If no server IDs are configured, allow all servers
    if (allowedServerIds.length === 0) return true
    return allowedServerIds.includes(guildId)
}

// State maps
const queues = new Map()
const disconnectTimers = new Map()
const fetchingStates = new Map()
const firstSongPlayed = new Map()
const lastTextChannel = new Map()

// Initialize module references
const refs = {
    client,
    queues,
    disconnectTimers,
    fetchingStates,
    firstSongPlayed,
    lastTextChannel,
}

setClientRef(client)
setQueuesRef(queues)
playerModule.init(refs)
commandsModule.init(refs)

// Client ready event
client.on('ready', () => {
    log(`Logged in as ${client.user.tag} (ID: ${client.user.id})`)
    log(`Bot is in ${client.guilds.cache.size} server(s)`)
    if (allowedServerIds.length > 0) {
        log(`Allowed server IDs: ${allowedServerIds.join(', ')}`)
        // Leave servers that are not allowed
        client.guilds.cache.forEach(guild => {
            if (!isServerAllowed(guild.id)) {
                log(`Leaving unauthorized server: ${guild.name} (${guild.id})`)
                guild.leave().catch(e => log(`Failed to leave server ${guild.name}: ${e.message}`))
            }
        })
    } else {
        log(`No server restrictions configured - bot will work in all servers`)
    }
    client.players = new Map()
    client.connections = new Map()
})

// Message handler
client.on('messageCreate', async message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return

    // Check if server is allowed
    if (!isServerAllowed(message.guild.id)) {
        log(`Command rejected - server not allowed: ${message.guild.name} (${message.guild.id})`)
        return message.channel.send(MESSAGES.SERVER_NOT_ALLOWED)
    }

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    try {
        // Store text channel for all music commands
        if (['p', 'queue', 'n', 's', 'c', 'pause', 'resume'].includes(command)) {
            lastTextChannel.set(message.guild.id, message.channel)
            log(`Stored text channel ${message.channel.name} for guild ${message.guild.name}`)
        }

        // Route commands
        switch (command) {
            case 'p':
                await commandsModule.handlePlay(message, args)
                break
            case 'queue':
                await commandsModule.handleQueue(message)
                break
            case 'n':
                await commandsModule.handleNext(message)
                break
            case 's':
                await commandsModule.handleStop(message)
                break
            case 'c':
                await commandsModule.handleClear(message)
                break
            case 'pause':
                await commandsModule.handlePause(message)
                break
            case 'resume':
                await commandsModule.handleResume(message)
                break
        }
    } catch (e) {
        log(`Error in command ${command} in ${message.guild.name}: ${e.message}`)
        await message.channel.send(`An error occurred: ${e.message}`)
    }
})

// Voice state update handler
client.on('voiceStateUpdate', (oldState, newState) => {
    if (!oldState.channelId || newState.channelId) return
    const guildId = oldState.guild.id
    const channel = oldState.guild.channels.cache.get(oldState.channelId)
    if (!channel) return
    const members = channel.members.filter(m => !m.user.bot)
    if (members.size === 0 && client.connections.get(guildId)) {
        const textChannel = lastTextChannel.get(guildId) || oldState.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(oldState.guild.members.me).has(PermissionsBitField.Flags.SendMessages))
        if (!textChannel) {
            log(`No valid text channel for voiceStateUpdate in ${oldState.guild.name}`)
            return
        }
        setDisconnectTimer(guildId, { guild: oldState.guild, channel: textChannel, member: oldState.member })
        log(`Initiated disconnect timer for ${oldState.guild.name} with text channel ${textChannel.name}`)
    }
})

// Login
client.login(process.env.DISCORD_TOKEN)