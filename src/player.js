const { createAudioResource, AudioPlayerStatus } = require('@discordjs/voice')
const { PermissionsBitField } = require('discord.js')
const { MESSAGES, LIMITS } = require('./constants')
const { log, logQueueSummary } = require('./logger')

// State maps - will be initialized from main
let client = null
let queues = null
let disconnectTimers = null
let fetchingStates = null
let firstSongPlayed = null
let lastTextChannel = null

function init(refs) {
    client = refs.client
    queues = refs.queues
    disconnectTimers = refs.disconnectTimers
    fetchingStates = refs.fetchingStates
    firstSongPlayed = refs.firstSongPlayed
    lastTextChannel = refs.lastTextChannel
}

async function playNext(message) {
    const guildId = message.guild.id
    const guildName = message.guild.name
    const queue = queues.get(guildId) || []
    const player = client.players.get(guildId)
    const connection = client.connections.get(guildId)

    if (!connection || !player) {
        log(`No voice connection or player in ${guildName}`)
        return
    }
    if (!queue.length) {
        log(`Queue empty for ${guildName}`)
        const targetChannel = lastTextChannel.get(guildId) || message.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.SendMessages))
        if (targetChannel) {
            try {
                await targetChannel.send(MESSAGES.QUEUE_EMPTY)
                log(`Sent empty queue message in ${guildName} to channel ${targetChannel.name}`)
            } catch (e) {
                log(`Failed to send empty queue message in ${guildName}: ${e.message}`)
            }
        } else {
            log(`No valid text channel for empty queue message in ${guildName}`)
        }
        setDisconnectTimer(guildId, message)
        return
    }

    const song = queue.shift()
    try {
        const resource = createAudioResource(song.streamUrl)
        player.play(resource)
        await message.channel.send(MESSAGES.NOW_PLAYING(song.title))
        log(`Playing ${song.title} in ${guildName}`)
        logQueueSummary()
        clearDisconnectTimer(guildId)
    } catch (e) {
        log(`Failed to play ${song.title} in ${guildName}: ${e.message}`)
        await message.channel.send(`Failed to play **${song.title}**: ${e.message}`)
        playNext(message)
    }
}

function setDisconnectTimer(guildId, message) {
    clearDisconnectTimer(guildId)
    disconnectTimers.set(guildId, setTimeout(async () => {
        const connection = client.connections.get(guildId)
        const player = client.players.get(guildId)
        const voiceChannelId = client.connections.get(guildId)?.channelId
        const voiceChannel = voiceChannelId && message.guild.channels.cache.get(voiceChannelId)
        const hasListeners = voiceChannel && voiceChannel.members.some(m => !m.user.bot)

        if (hasListeners) {
            log(`Listeners still present in ${message.guild.name}, skipping disconnect`)
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

        const targetChannel = lastTextChannel.get(guildId) || message.guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(message.guild.members.me).has(PermissionsBitField.Flags.SendMessages))
        if (targetChannel) {
            try {
                await targetChannel.send(MESSAGES.NO_LISTENERS)
                log(`Sent no-listeners message in ${message.guild.name} to channel ${targetChannel.name}`)
            } catch (e) {
                log(`Failed to send no-listeners message in ${message.guild.name}: ${e.message}`)
            }
        } else {
            log(`No valid text channel for no-listeners message in ${message.guild.name}`)
        }

        log(`Disconnected from ${message.guild.name} due to no listeners`)
        logQueueSummary()
    }, LIMITS.DISCONNECT_TIMEOUT_MS))
}

function clearDisconnectTimer(guildId) {
    const timer = disconnectTimers.get(guildId)
    if (timer) clearTimeout(timer)
    disconnectTimers.delete(guildId)
}

module.exports = {
    init,
    playNext,
    setDisconnectTimer,
    clearDisconnectTimer,
}

