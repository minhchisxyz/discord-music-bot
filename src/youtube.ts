import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import dotenv from 'dotenv'

// Use project root directory (where package.json is)
const projectRoot = process.cwd()

dotenv.config({ path: path.join(projectRoot, '.env') })

const execPromise = promisify(exec)

import { log } from './logger.js'
import type { MixPlaylistItem, PlaylistItem, StreamUrlResult } from './types.js'

// YouTube API setup
export const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
})

// Path to YouTube cookies file for authenticated requests (personalized playlists)
const cookiesPath = path.join(projectRoot, 'cookies.txt')
const hasCookiesFile = fs.existsSync(cookiesPath)

if (hasCookiesFile) {
    log(`Found cookies.txt - personalized playlists enabled`)
} else {
    log(`No cookies.txt found - Mix playlists will not be personalized`)
}

export async function fetchMixPlaylist(url: string, guildName: string): Promise<MixPlaylistItem[]> {
    try {
        // Use cookies file if available
        const cookiesArg = hasCookiesFile ? `--cookies "${cookiesPath}"` : ''
        const { stdout } = await execPromise(
            `chcp 65001 >nul && yt-dlp ${cookiesArg} --flat-playlist --print "%(id)s|%(title)s" --encoding utf-8 "${url}"`,
            { timeout: 60000, encoding: 'utf8' }
        )
        const lines = stdout.trim().split('\n').filter(Boolean)
        return lines.map(line => {
            const [id, ...titleParts] = line.split('|')
            return {
                videoId: id,
                title: titleParts.join('|') || 'Unknown',
                url: `https://www.youtube.com/watch?v=${id}`
            }
        })
    } catch (e) {
        const error = e as Error
        log(`Error fetching mix playlist in ${guildName}: ${error.message}`)
        throw e
    }
}

export async function fetchStreamUrl(query: string): Promise<StreamUrlResult> {
    let streamUrl: string
    try {
        const { stdout } = await execPromise(`yt-dlp -g -f bestaudio --no-playlist "${query}"`, { timeout: 7000 })
        streamUrl = stdout.trim()
    } catch (e) {
        throw e
    }

    let title: string
    const videoId = new URL(query).searchParams.get('v') || query.split('v=')[1]?.split('&')[0]
    if (videoId) {
        try {
            const res = await youtube.videos.list({
                part: ['snippet'],
                id: [videoId],
            })
            if (res.data.items && res.data.items.length) {
                title = res.data.items[0].snippet?.title || 'Unknown'
            } else {
                throw new Error('Video not found via YouTube API')
            }
        } catch (e) {
            try {
                const { stdout } = await execPromise(`chcp 65001 >nul && yt-dlp --get-title --encoding utf-8 "${query}"`, { timeout: 7000, encoding: 'utf8' })
                title = stdout.trim()
            } catch (e) {
                throw new Error('Could not fetch title')
            }
        }
    } else {
        throw new Error('Invalid YouTube URL')
    }
    return { streamUrl, title }
}

export async function searchVideo(query: string): Promise<string | null> {
    const res = await youtube.search.list({
        part: ['snippet'],
        q: query,
        maxResults: 1,
        type: ['video'],
    })
    if (!res.data.items || !res.data.items.length) {
        return null
    }
    const videoId = res.data.items[0].id?.videoId
    if (!videoId) return null
    return `https://www.youtube.com/watch?v=${videoId}`
}

export async function fetchPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    const res = await youtube.playlistItems.list({
        part: ['snippet'],
        playlistId,
        maxResults: 50,
    })
    if (!res.data.items) return []
    return res.data.items.map(item => ({
        videoId: item.snippet?.resourceId?.videoId || '',
        videoUrl: `https://www.youtube.com/watch?v=${item.snippet?.resourceId?.videoId}`,
        title: item.snippet?.title || 'Unknown'
    }))
}

export async function fetchStreamOnly(videoUrl: string): Promise<string> {
    const { stdout } = await execPromise(`yt-dlp -g -f bestaudio --no-playlist "${videoUrl}"`, { timeout: 7000 })
    return stdout.trim()
}

