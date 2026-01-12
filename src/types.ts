import { Client, GuildTextBasedChannel } from 'discord.js'
import { AudioPlayer, VoiceConnection } from '@discordjs/voice'

// Song in the queue
export interface Song {
    title: string
    url: string
    streamUrl: string
}

// Guild queue type
export type GuildQueue = Song[]

// State maps types
export type QueuesMap = Map<string, GuildQueue>
export type DisconnectTimersMap = Map<string, NodeJS.Timeout>
export type FetchingStatesMap = Map<string, boolean>
export type FirstSongPlayedMap = Map<string, boolean>
export type LastTextChannelMap = Map<string, GuildTextBasedChannel>
export type PlayersMap = Map<string, AudioPlayer>
export type ConnectionsMap = Map<string, VoiceConnection>

// Extended client with custom properties
export interface ExtendedClient extends Client {
    players: PlayersMap
    connections: ConnectionsMap
}

// Module references passed to init functions
export interface ModuleRefs {
    client: ExtendedClient
    queues: QueuesMap
    disconnectTimers: DisconnectTimersMap
    fetchingStates: FetchingStatesMap
    firstSongPlayed: FirstSongPlayedMap
    lastTextChannel: LastTextChannelMap
}

// Song check result from filters
export interface SongCheckResult {
    allowed: boolean
    reason?: string
    message?: string
}

// Playlist item from YouTube API
export interface PlaylistItem {
    videoId: string
    videoUrl: string
    title: string
}

// Mix playlist item from yt-dlp
export interface MixPlaylistItem {
    videoId: string
    title: string
    url: string
}

// Stream URL result
export interface StreamUrlResult {
    streamUrl: string
    title: string
}

// Filter configuration
export interface FiltersConfig {
    singers: string[]
    allowedTitles: string[]
    forbiddenTitles: string[]
}

