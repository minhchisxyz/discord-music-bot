import { joinVoiceChannel, createAudioPlayer, AudioPlayerStatus } from '@discordjs/voice'
import { PermissionsBitField } from 'discord.js'
import { MESSAGES, LIMITS } from './constants.js'
import { log, logQueueSummary, logSkippedSong } from './logger.js'
import { shouldAddSong } from './filters.js'
import { fetchStreamUrl, searchVideo, fetchMixPlaylist, fetchPlaylistItems, fetchStreamOnly } from './youtube.js'
import { playNext, setDisconnectTimer, clearDisconnectTimer } from './player.js'

// State maps - will be initialized from main
let client = null
let queues = null
let fetchingStates = null
let firstSongPlayed = null
let lastTextChannel = null

function init(refs) {
    client = refs.client
    queues = refs.queues
    fetchingStates = refs.fetchingStates
    firstSongPlayed = refs.firstSongPlayed
    lastTextChannel = refs.lastTextChannel
}

async function handlePlay(message, args) {
    if (!message.member?.voice?.channel) {
        log(`User not in voice channel in ${message.guild.name}`)
        return message.channel.send(MESSAGES.NOT_IN_VOICE)
    }

    const voiceChannel = message.member.voice.channel
    const perms = voiceChannel.permissionsFor(message.guild.members.me)
    if (!perms || !perms.has(PermissionsBitField.Flags.Connect) || !perms.has(PermissionsBitField.Flags.Speak)) {
        const botRole = message.guild.members.me.roles.highest
        const serverPerms = message.guild.members.me.permissions
        log(`Missing permissions in ${message.guild.name}: connect=${perms.has(PermissionsBitField.Flags.Connect)}, speak=${perms.has(PermissionsBitField.Flags.Speak)}, botRole=${botRole?.name || 'None'}, serverConnect=${serverPerms.has(PermissionsBitField.Flags.Connect)}, serverSpeak=${serverPerms.has(PermissionsBitField.Flags.Speak)}`)
        return message.channel.send(
            `Bot lacks permissions! Please ensure the bot has Connect and Speak permissions in the voice channel. ` +
            `Try: 1) Check channel permissions in Server Settings > Channels > Edit Channel. ` +
            `2) Ensure the bot's role has Connect and Speak enabled. ` +
            `3) Re-invite the bot with: https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=3145728`
        )
    }

    const query = args.join(' ')
    if (!query) return message.channel.send(MESSAGES.NO_QUERY)

    let connection = client.connections.get(message.guild.id)
    if (!connection) {
        connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        })
        client.connections.set(message.guild.id, connection)
        log(`Connected to voice channel ${voiceChannel.name} (ID: ${voiceChannel.id}) in ${message.guild.name}`)
    }

    let player = client.players.get(message.guild.id)
    if (!player) {
        player = createAudioPlayer()
        client.players.set(message.guild.id, player)
        connection.subscribe(player)
        player.on(AudioPlayerStatus.Idle, () => playNext(message))
        player.on('error', e => log(`Player error in ${message.guild.name}: ${e.message}`))
    }

    const guildId = message.guild.id
    if (!queues.has(guildId)) queues.set(guildId, [])
    const queue = queues.get(guildId)

    let url = query
    if (!query.startsWith('https://')) {
        try {
            url = await searchVideo(query)
            if (!url) {
                return message.channel.send(MESSAGES.NO_RESULTS)
            }
            log(`Found video: ${url} in ${message.guild.name}`)
        } catch (e) {
            log(`YouTube API error in ${message.guild.name}: ${e.message}`)
            return message.channel.send(`Error searching YouTube: ${e.message}`)
        }
    }

    const playlistId = new URLSearchParams(new URL(url).search).get('list')
    const videoId = new URLSearchParams(new URL(url).search).get('v')

    // If URL contains a playlist, fetch the whole playlist
    if (playlistId) {
        try {
            // First, play the current video immediately if there's a video ID in the URL
            let currentVideoPlayed = false
            if (videoId) {
                const currentVideoUrl = `https://www.youtube.com/watch?v=${videoId}`
                try {
                    const { streamUrl, title } = await fetchStreamUrl(currentVideoUrl, message.guild.name)
                    const songCheck = await shouldAddSong(title, message.guild.name)
                    if (songCheck.allowed) {
                        if (queue.length < LIMITS.QUEUE_MAX_SONGS) {
                            queue.push({ title, url: currentVideoUrl, streamUrl })
                            log(`Added current video first: ${title} in ${message.guild.name}`)
                            if (player.state.status !== AudioPlayerStatus.Playing) {
                                playNext(message)
                            }
                            currentVideoPlayed = true
                        }
                    } else {
                        await message.channel.send(songCheck.message)
                        log(`Skipped current video: ${title} in ${message.guild.name}`)
                    }
                } catch (e) {
                    log(`Error fetching current video ${videoId} in ${message.guild.name}: ${e.message}`)
                }
            }

            log(`Fetching playlist ${playlistId} for ${message.guild.name}`)
            fetchingStates.set(guildId, true)
            await message.channel.send(MESSAGES.PLAYLIST_LOADING)

            // Check if it's a Mix/Radio playlist (starts with 'RD')
            const isMixPlaylist = playlistId.startsWith('RD')
            let items = []

            if (isMixPlaylist) {
                // Use yt-dlp for Mix/Radio playlists (personalized, not accessible via YouTube API)
                log(`Detected Mix/Radio playlist, using yt-dlp to fetch in ${message.guild.name}`)
                const mixItems = await fetchMixPlaylist(url, message.guild.name)
                items = mixItems.map(item => ({
                    videoId: item.videoId,
                    videoUrl: item.url,
                    title: item.title
                }))
            } else {
                // Use YouTube API for regular playlists
                items = await fetchPlaylistItems(playlistId)
            }

            log(`Found ${items.length} items in playlist ${playlistId}`)
            let addedCount = currentVideoPlayed ? 1 : 0
            let skippedCount = 0

            for (const item of items) {
                // Skip the current video since we already added it
                if (item.videoId === videoId) {
                    continue
                }
                // Stop if we've added enough songs from the playlist
                if (addedCount >= LIMITS.PLAYLIST_MAX_SONGS) {
                    log(`Reached playlist max songs limit (${LIMITS.PLAYLIST_MAX_SONGS}) for ${message.guild.name}`)
                    break
                }
                if (!fetchingStates.get(guildId)) {
                    log(`Playlist fetching cancelled for ${message.guild.name}`)
                    break
                }
                if (queue.length >= LIMITS.QUEUE_MAX_SONGS) {
                    await message.channel.send(MESSAGES.PLAYLIST_QUEUE_LIMIT)
                    break
                }
                const videoUrl = item.videoUrl
                const title = item.title
                if (['Private video', 'Deleted video'].includes(title)) {
                    await message.channel.send(MESSAGES.SKIP_PRIVATE_DELETED(title))
                    log(`Skipped: ${title} in ${message.guild.name}`)
                    logSkippedSong(title, message.guild.name)
                    skippedCount++
                    continue
                }
                const songCheck = await shouldAddSong(title, message.guild.name)
                if (!songCheck.allowed) {
                    await message.channel.send(songCheck.message)
                    log(`Skipped: ${title} in ${message.guild.name}`)
                    skippedCount++
                    continue
                }
                let streamUrl
                try {
                    streamUrl = await fetchStreamOnly(videoUrl)
                } catch (e) {
                    await message.channel.send(MESSAGES.SKIP_FETCH_ERROR(title))
                    log(`Skipped: ${title} in ${message.guild.name}`)
                    logSkippedSong(title, message.guild.name)
                    skippedCount++
                    continue
                }
                if (!fetchingStates.get(guildId)) {
                    log(`Playlist fetching cancelled for ${message.guild.name}`)
                    break
                }
                queue.push({ title, url: videoUrl, streamUrl })
                log(`Added: ${title} in ${message.guild.name}`)
                addedCount++

                // Start playing if not already playing (in case current video failed)
                if (player.state.status !== AudioPlayerStatus.Playing) {
                    playNext(message)
                }
            }
            fetchingStates.delete(guildId)
            await message.channel.send(MESSAGES.PLAYLIST_COMPLETE(addedCount, skippedCount))
            log(`Playlist processing complete for ${message.guild.name}: Added ${addedCount} songs, skipped ${skippedCount} songs`)
            logQueueSummary()
        } catch (e) {
            fetchingStates.delete(guildId)
            log(`Error fetching playlist ${playlistId} in ${message.guild.name}: ${e.message}`)
            await message.channel.send(`Error fetching playlist: ${e.message}`)
        }
    } else {
        // Single video - no playlist parameter
        try {
            const { streamUrl, title } = await fetchStreamUrl(url, message.guild.name)
            const songCheck = await shouldAddSong(title, message.guild.name)
            if (!songCheck.allowed) {
                await message.channel.send(songCheck.message)
                log(`Skipped: ${title} in ${message.guild.name}`)
                logQueueSummary()
                return
            }
            if (queue.length >= LIMITS.QUEUE_MAX_SONGS) {
                return message.channel.send(MESSAGES.PLAYLIST_QUEUE_LIMIT)
            }
            queue.push({ title, url, streamUrl })
            log(`Added: ${title} in ${message.guild.name}`)
            logQueueSummary()

            if (player.state.status !== AudioPlayerStatus.Playing) {
                playNext(message)
            }
        } catch (e) {
            log(`Error adding song ${url} in ${message.guild.name}: ${e.message}`)
            return message.channel.send(`Error adding song: ${e.message}`)
        }
    }
}

async function handleQueue(message) {
    const queue = queues.get(message.guild.id) || []
    if (!queue.length) {
        return message.channel.send(MESSAGES.QUEUE_EMPTY_DISPLAY)
    }
    const queueList = queue.map((song, i) => `${i + 1}. ${song.title}`).join('\n')
    await message.channel.send(`**Current Queue**:\n${queueList}`)
    log(`Displayed queue in ${message.guild.name}`)
}

async function handleNext(message) {
    const player = client.players.get(message.guild.id)
    if (player && player.state.status === AudioPlayerStatus.Playing) {
        player.stop()
        await message.channel.send(MESSAGES.SKIPPED_TO_NEXT)
        log(`Skipped to next song in ${message.guild.name}`)
    } else {
        await message.channel.send(MESSAGES.NO_SONG_PLAYING)
        log(`No song playing to skip in ${message.guild.name}`)
    }
}

async function handleStop(message) {
    const guildId = message.guild.id
    const connection = client.connections.get(guildId)
    const player = client.players.get(guildId)
    if (connection) {
        connection.destroy()
        client.connections.delete(guildId)
    }
    if (player) {
        player.stop()
        client.players.delete(guildId)
    }
    queues.delete(guildId)
    fetchingStates.set(guildId, false)
    firstSongPlayed.delete(guildId)
    clearDisconnectTimer(guildId)
    try {
        await message.channel.send(MESSAGES.QUEUE_EMPTY)
        await message.channel.send(MESSAGES.STOPPED)
    } catch (e) {
        log(`Failed to send stop message in ${message.guild.name}: ${e.message}`)
    }
    log(`Stopped and disconnected from ${message.guild.name}, cancelled any playlist fetching`)
    logQueueSummary()
}

async function handlePause(message) {
    const player = client.players.get(message.guild.id)
    if (player && player.state.status === AudioPlayerStatus.Playing) {
        player.pause()
        await message.channel.send(MESSAGES.PAUSED)
        log(`Paused music in ${message.guild.name}`)
    } else {
        await message.channel.send(MESSAGES.NO_MUSIC_PLAYING)
        log(`No music playing to pause in ${message.guild.name}`)
    }
}

async function handleResume(message) {
    const player = client.players.get(message.guild.id)
    if (player && player.state.status === AudioPlayerStatus.Paused) {
        player.unpause()
        await message.channel.send(MESSAGES.RESUMED)
        log(`Resumed music in ${message.guild.name}`)
    } else {
        await message.channel.send(MESSAGES.NOT_PAUSED)
        log(`Music not paused in ${message.guild.name}`)
    }
}

async function handleClear(message) {
    const guildId = message.guild.id
    const queue = queues.get(guildId)
    if (queue && queue.length > 0) {
        const clearedCount = queue.length
        queue.length = 0
        await message.channel.send(MESSAGES.QUEUE_CLEARED)
        log(`Cleared ${clearedCount} songs from queue in ${message.guild.name}`)
    } else {
        await message.channel.send(MESSAGES.QUEUE_EMPTY_DISPLAY)
        log(`Queue already empty in ${message.guild.name}`)
    }
    logQueueSummary()
}

export {
    init,
    handlePlay,
    handleQueue,
    handleNext,
    handleStop,
    handlePause,
    handleResume,
    handleClear,
}
