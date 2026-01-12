import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env') })

const execPromise = promisify(exec)

import { log } from './logger.js'

// YouTube API setup
const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
})

// Path to YouTube cookies file for authenticated requests (personalized playlists)
const cookiesPath = path.join(__dirname, '..', 'cookies.txt')
const hasCookiesFile = fs.existsSync(cookiesPath)
// Set to 'edge', 'chrome', 'firefox', 'opera', 'brave', or null to disable browser cookie extraction
const browserForCookies = 'edge'

if (hasCookiesFile) {
    log(`Found cookies.txt - personalized playlists enabled via file`)
} else if (browserForCookies) {
    log(`No cookies.txt found - will use cookies from ${browserForCookies} browser for personalized playlists`)
} else {
    log(`No cookies.txt found and browser cookie extraction disabled - Mix playlists will not be personalized`)
}

async function fetchMixPlaylist(url, guildName) {
    try {
        // Use cookies file if available, otherwise try browser cookie extraction
        let cookiesArg = ''
        if (hasCookiesFile) {
            cookiesArg = `--cookies "${cookiesPath}"`
        } else if (browserForCookies) {
            cookiesArg = `--cookies-from-browser ${browserForCookies}`
        }
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
        log(`Error fetching mix playlist in ${guildName}: ${e.message}`)
        throw e
    }
}

async function fetchStreamUrl(query, guildName) {
    let streamUrl
    try {
        const { stdout } = await execPromise(`yt-dlp -g -f bestaudio --no-playlist "${query}"`, { timeout: 7000 })
        streamUrl = stdout.trim()
    } catch (e) {
        throw e
    }

    let title
    const videoId = new URL(query).searchParams.get('v') || query.split('v=')[1]?.split('&')[0]
    if (videoId) {
        try {
            const res = await youtube.videos.list({
                part: 'snippet',
                id: videoId,
            })
            if (res.data.items.length) {
                title = res.data.items[0].snippet.title
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

async function searchVideo(query) {
    const res = await youtube.search.list({
        part: 'snippet',
        q: query,
        maxResults: 1,
        type: 'video',
    })
    if (!res.data.items.length) {
        return null
    }
    return `https://www.youtube.com/watch?v=${res.data.items[0].id.videoId}`
}

async function fetchPlaylistItems(playlistId) {
    const res = await youtube.playlistItems.list({
        part: 'snippet',
        playlistId,
        maxResults: 50,
    })
    return res.data.items.map(item => ({
        videoId: item.snippet.resourceId.videoId,
        videoUrl: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
        title: item.snippet.title
    }))
}

async function fetchStreamOnly(videoUrl) {
    const { stdout } = await execPromise(`yt-dlp -g -f bestaudio --no-playlist "${videoUrl}"`, { timeout: 7000 })
    return stdout.trim()
}

export {
    youtube,
    fetchMixPlaylist,
    fetchStreamUrl,
    searchVideo,
    fetchPlaylistItems,
    fetchStreamOnly,
}
