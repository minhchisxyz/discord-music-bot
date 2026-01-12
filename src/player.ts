import { createAudioResource } from '@discordjs/voice'
import { PermissionsBitField, Message, GuildTextBasedChannel } from 'discord.js'
import { MESSAGES, LIMITS } from './constants.js'
import { log, logQueueSummary } from './logger.js'
import type {
    ExtendedClient,
    QueuesMap,
    DisconnectTimersMap,
    FetchingStatesMap,
    FirstSongPlayedMap,
    LastTextChannelMap,
    ModuleRefs
} from './types.js'

// State maps - will be initialized from main
let client: ExtendedClient | null = null
let queues: QueuesMap | null = null
let disconnectTimers: DisconnectTimersMap | null = null
let fetchingStates: FetchingStatesMap | null = null
let firstSongPlayed: FirstSongPlayedMap | null = null
let lastTextChannel: LastTextChannelMap | null = null

export function init(refs: ModuleRefs): void {
    client = refs.client
    queues = refs.queues
    disconnectTimers = refs.disconnectTimers
    fetchingStates = refs.fetchingStates
    firstSongPlayed = refs.firstSongPlayed
    lastTextChannel = refs.lastTextChannel
}

export async function playNext(message: Message<true>): Promise<void> {
    if (!client || !queues || !disconnectTimers || !fetchingStates || !firstSongPlayed || !lastTextChannel) {
        log('Player not initialized')
        return
    }

    const guildId = message.guild!.id
    const guildName = message.guild!.name
    const queue = queues.get(guildId) || []
    const player = client.players.get(guildId)
    const connection = client.connections.get(guildId)

    if (!connection || !player) {
        log(`No voice connection or player in ${guildName}`)
        return
    }
    if (!queue.length) {
        log(`Queue empty for ${guildName}`)
        const targetChannel = lastTextChannel.get(guildId) || message.guild.channels.cache.find(c =>
            c.isTextBased() && c.permissionsFor(message.guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)
        ) as GuildTextBasedChannel | undefined
        if (targetChannel) {
            try {
                await targetChannel.send(MESSAGES.QUEUE_EMPTY)
                log(`Sent empty queue message in ${guildName} to channel ${(targetChannel as any).name}`)
            } catch (e) {
                const error = e as Error
                log(`Failed to send empty queue message in ${guildName}: ${error.message}`)
            }
        } else {
            log(`No valid text channel for empty queue message in ${guildName}`)
        }
        setDisconnectTimer(guildId, message)
        return
    }

    const song = queue.shift()!
    try {
        const resource = createAudioResource(song.streamUrl)
        player.play(resource)
        await message.channel.send(MESSAGES.NOW_PLAYING(song.title))
        log(`Playing ${song.title} in ${guildName}`)
        logQueueSummary()
        clearDisconnectTimer(guildId)
    } catch (e) {
        const error = e as Error
        log(`Failed to play ${song.title} in ${guildName}: ${error.message}`)
        await message.channel.send(`Failed to play **${song.title}**: ${error.message}`)
        playNext(message)
    }
}

export function setDisconnectTimer(guildId: string, message: Message<true>): void {
    if (!client || !queues || !disconnectTimers || !fetchingStates || !firstSongPlayed || !lastTextChannel) {
        return
    }

    clearDisconnectTimer(guildId)
    disconnectTimers.set(guildId, setTimeout(async () => {
        if (!client || !queues || !disconnectTimers || !fetchingStates || !firstSongPlayed || !lastTextChannel) {
            return
        }

        const connection = client.connections.get(guildId)
        const player = client.players.get(guildId)
        const voiceChannelId = client.connections.get(guildId)?.joinConfig?.channelId
        const voiceChannel = voiceChannelId ? message.guild!.channels.cache.get(voiceChannelId) : null
        const hasListeners = voiceChannel && 'members' in voiceChannel &&
            (voiceChannel as any).members.some((m: any) => !m.user.bot)

        if (hasListeners) {
            log(`Listeners still present in ${message.guild!.name}, skipping disconnect`)
            return
        }

        if (connection) {
            connection.destroy()
            client.connections.delete(guildId)
        }
        if (player) {
            player.stop()
            client.players.delete(guildId)
        }
        queues.delete(guildId)
        fetchingStates.delete(guildId)
        firstSongPlayed.delete(guildId)

        const targetChannel = lastTextChannel.get(guildId) || message.guild.channels.cache.find(c =>
            c.isTextBased() && c.permissionsFor(message.guild.members.me!)?.has(PermissionsBitField.Flags.SendMessages)
        ) as GuildTextBasedChannel | undefined
        if (targetChannel) {
            try {
                await targetChannel.send(MESSAGES.NO_LISTENERS)
                log(`Sent no-listeners message in ${message.guild.name} to channel ${(targetChannel as any).name}`)
            } catch (e) {
                const error = e as Error
                log(`Failed to send no-listeners message in ${message.guild!.name}: ${error.message}`)
            }
        } else {
            log(`No valid text channel for no-listeners message in ${message.guild!.name}`)
        }

        log(`Disconnected from ${message.guild!.name} due to no listeners`)
        logQueueSummary()
    }, LIMITS.DISCONNECT_TIMEOUT_MS))
}

export function clearDisconnectTimer(guildId: string): void {
    if (!disconnectTimers) return
    const timer = disconnectTimers.get(guildId)
    if (timer) clearTimeout(timer)
    disconnectTimers.delete(guildId)
}

