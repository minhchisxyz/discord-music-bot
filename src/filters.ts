import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MESSAGES, SKIP_REASONS } from './constants.js'
import { log, logSkippedSong } from './logger.js'
import type { SongCheckResult, FiltersConfig } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Filter state
let singers: string[] = []
let allowedTitles: string[] = []
let forbiddenTitles: string[] = []

const filtersPath = path.join(__dirname, '..', 'filters.json')

export function loadFilters(): void {
    try {
        const filters: FiltersConfig = JSON.parse(fs.readFileSync(filtersPath, 'utf-8'))
        singers = filters.singers || []
        allowedTitles = filters.allowedTitles || []
        forbiddenTitles = filters.forbiddenTitles || []
        log('Loaded filters.json')
        log(`Singers: ${singers.join(', ')}`)
        log(`Allowed titles: ${allowedTitles.join(', ')}`)
        log(`Forbidden titles: ${forbiddenTitles.join(', ')}`)
    } catch (e) {
        const error = e as Error
        log(`Error loading filters.json: ${error.message}`)
        const defaultFilters: FiltersConfig = {
            singers: ['VSTRA'],
            allowedTitles: [],
            forbiddenTitles: []
        }
        fs.writeFileSync(filtersPath, JSON.stringify(defaultFilters, null, 2))
        singers = defaultFilters.singers
        allowedTitles = defaultFilters.allowedTitles
        forbiddenTitles = defaultFilters.forbiddenTitles
    }
}

// Initial load
loadFilters()

// Watch for changes to filters.json
let filtersDebounceTimer: NodeJS.Timeout | null = null
fs.watch(filtersPath, (eventType) => {
    if (eventType === 'change') {
        // Debounce to avoid multiple reloads on rapid saves
        if (filtersDebounceTimer) clearTimeout(filtersDebounceTimer)
        filtersDebounceTimer = setTimeout(() => {
            log('filters.json changed, reloading...')
            loadFilters()
        }, 500)
    }
})

export async function shouldAddSong(title: string, guildName: string): Promise<SongCheckResult> {
    const lowerTitle = title.toLowerCase()
    // First check: singers and allowedTitles (whitelist - if match, allow)
    if (singers.some(singer => lowerTitle.includes(singer.toLowerCase()))) {
        return { allowed: true }
    }
    if (allowedTitles.some(allowedTitle => lowerTitle.includes(allowedTitle.toLowerCase()))) {
        return { allowed: true }
    }
    // Second check: forbiddenTitles (blacklist - if match, skip)
    if (forbiddenTitles.some(forbiddenTitle => lowerTitle.includes(forbiddenTitle.toLowerCase()))) {
        logSkippedSong(title, guildName)
        return { allowed: false, reason: SKIP_REASONS.FORBIDDEN, message: MESSAGES.SKIP_FORBIDDEN(title) }
    }
    // Check for Vietnamese-specific characters (with diacritics)
    const vietnameseSpecific = /[ăắằẳặẵâấầẩậẫđĐêếềểệễôốồổộỗơớờởợỡưứừửựữ]/i
    if (!vietnameseSpecific.test(title)) {
        logSkippedSong(title, guildName)
        return { allowed: false, reason: SKIP_REASONS.NOT_VIETNAMESE, message: MESSAGES.SKIP_NOT_VIETNAMESE(title) }
    }
    return { allowed: true }
}

