import { Client, GatewayIntentBits, PermissionsBitField, Message, GuildTextBasedChannel } from 'discord.js'
import dotenv from 'dotenv'

dotenv.config()

// Import modules
import { log, setClientRef, setQueuesRef } from './src/logger.js'
import { setDisconnectTimer } from './src/player.js'
import * as playerModule from './src/player.js'
import * as commandsModule from './src/commands.js'
import { MESSAGES } from './src/constants.js'
import type {
    ExtendedClient,
    QueuesMap,
    DisconnectTimersMap,
    FetchingStatesMap,
    FirstSongPlayedMap,
    LastTextChannelMap,
    ModuleRefs
} from './src/types.js'

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    log(`Uncaught Exception: ${error.message}`)
    console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled Rejection at: ${promise}, reason: ${reason}`)
    console.error('Unhandled Rejection:', reason)
})

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
    ],
}) as ExtendedClient

// Bot configuration
const prefix = 'c.'

// Allowed server IDs from environment variable
const allowedServerIds: string[] = process.env.ALLOWED_SERVER_IDS
    ? process.env.ALLOWED_SERVER_IDS.split(',').map(id => id.trim())
    : []

function isServerAllowed(guildId: string): boolean {
    // If no server IDs are configured, allow all servers
    if (allowedServerIds.length === 0) return true
    return allowedServerIds.includes(guildId)
}

// State maps
const queues: QueuesMap = new Map()
const disconnectTimers: DisconnectTimersMap = new Map()
const fetchingStates: FetchingStatesMap = new Map()
const firstSongPlayed: FirstSongPlayedMap = new Map()
const lastTextChannel: LastTextChannelMap = new Map()

// Initialize module references
const refs: ModuleRefs = {
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
client.on('clientReady', () => {
    log(`Logged in as ${client.user!.tag} (ID: ${client.user!.id})`)
    log(`Bot is in ${client.guilds.cache.size} server(s)`)
    if (allowedServerIds.length > 0) {
        log(`Allowed server IDs: ${allowedServerIds.join(', ')}`)
        // Leave servers that are not allowed
        client.guilds.cache.forEach(guild => {
            if (!isServerAllowed(guild.id)) {
                log(`Leaving unauthorized server: ${guild.name} (${guild.id})`)
                guild.leave().catch(e => log(`Failed to leave server ${guild.name}: ${(e as Error).message}`))
            }
        })
    } else {
        log(`No server restrictions configured - bot will work in all servers`)
    }
    client.players = new Map()
    client.connections = new Map()
})

// Message handler
client.on('messageCreate', async (msg: Message) => {
    if (!msg.content.startsWith(prefix) || msg.author.bot) return
    if (!msg.guild || !msg.inGuild()) return

    // Now TypeScript knows this is a guild message
    const message = msg as Message<true>

    // Check if server is allowed
    if (!isServerAllowed(message.guild.id)) {
        log(`Command rejected - server not allowed: ${message.guild.name} (${message.guild.id})`)
        await message.channel.send(MESSAGES.SERVER_NOT_ALLOWED)
        return
    }

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift()?.toLowerCase()
    if (!command) return

    try {
        // Store text channel for all music commands
        if (['p', 'queue', 'n', 's', 'c', 'pause', 'resume'].includes(command)) {
            lastTextChannel.set(message.guild.id, message.channel as GuildTextBasedChannel)
            log(`Stored text channel ${(message.channel as any).name} for guild ${message.guild.name}`)
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
        const error = e as Error
        log(`Error in command ${command} in ${message.guild.name}: ${error.message}`)
        await message.channel.send(`An error occurred: ${error.message}`)
    }
})

// Voice state update handler
client.on('voiceStateUpdate', (oldState, newState) => {
    if (!oldState.channelId || newState.channelId) return
    const guildId = oldState.guild.id
    const channel = oldState.guild.channels.cache.get(oldState.channelId)
    if (!channel || !('members' in channel)) return
    const members = (channel as any).members.filter((m: any) => !m.user.bot)
    if (members.size === 0 && client.connections.get(guildId)) {
        const textChannel = lastTextChannel.get(guildId) || oldState.guild.channels.cache.find(c =>
            c.isTextBased() && c.permissionsFor(oldState.guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)
        ) as GuildTextBasedChannel | undefined
        if (!textChannel) {
            log(`No valid text channel for voiceStateUpdate in ${oldState.guild.name}`)
            return
        }
        // Create a minimal message-like object for setDisconnectTimer
        const fakeMessage = {
            guild: oldState.guild,
            channel: textChannel,
            member: oldState.member,
        } as unknown as Message<true>
        setDisconnectTimer(guildId, fakeMessage)
        log(`Initiated disconnect timer for ${oldState.guild.name} with text channel ${(textChannel as any).name}`)
    }
})

// Login
client.login(process.env.DISCORD_TOKEN)

