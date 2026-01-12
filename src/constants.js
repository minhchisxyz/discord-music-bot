// ============== CONFIGURABLE MESSAGES ==============
const MESSAGES = {
    // Playing messages
    NOW_PLAYING: (title) => `🎵 Lên nhạc: **${title}**`,
    QUEUE_EMPTY: '**Hết nhạc rầu mấy bé oi, nào nghe tiếp thì bố lại ngoi lên**',
    NO_LISTENERS: '**Mấy cu iem đếch nghe nữa à. Pipi sicula**',

    // Skip reasons
    SKIP_FORBIDDEN: (title) => `❌ Nhạc cứt: **${title}**`,
    SKIP_NOT_VIETNAMESE: (title) => `❌ Không phải nhạc Việt: **${title}**`,
    SKIP_PRIVATE_DELETED: (title) => `❌ Video không khả dụng: **${title}**`,
    SKIP_FETCH_ERROR: (title) => `❌ Không thể tải: **${title}**`,

    // Playlist messages
    PLAYLIST_LOADING: '📋 Đang tải playlist...',
    PLAYLIST_COMPLETE: (added, skipped) => `✅ Playlist hoàn tất: Đã thêm ${added} bài, bỏ qua ${skipped} bài`,
    PLAYLIST_QUEUE_LIMIT: 'Queue limit of 50 songs reached!',

    // Command responses
    SKIPPED_TO_NEXT: 'Skipped to next song!',
    QUEUE_CLEARED: '🗑️ Queue đã được xóa!',
    SERVER_NOT_ALLOWED: '❌ Bot không được phép hoạt động trong server này.',
    NO_SONG_PLAYING: 'No song is playing.',
    STOPPED: 'Stopped music, cleared queue, and left the voice channel.',
    PAUSED: 'Paused the music.',
    RESUMED: 'Resumed the music.',
    NOT_PAUSED: 'Music is not paused.',
    NO_MUSIC_PLAYING: 'No music is playing.',

    // Error messages
    NOT_IN_VOICE: 'You need to be in a voice channel!',
    NO_QUERY: 'Please provide a URL or search query!',
    NO_RESULTS: 'No results found.',
    QUEUE_EMPTY_DISPLAY: 'Queue is empty.',
}

// ============== CONFIGURABLE LIMITS ==============
const LIMITS = {
    PLAYLIST_MAX_SONGS: 20,
    QUEUE_MAX_SONGS: 50,
    DISCONNECT_TIMEOUT_MS: 60 * 1000,
}

// ============== SKIP REASONS (for logging) ==============
const SKIP_REASONS = {
    FORBIDDEN: 'forbidden_title',
    NOT_VIETNAMESE: 'not_vietnamese',
    PRIVATE_DELETED: 'private_or_deleted',
    FETCH_ERROR: 'fetch_error',
}

module.exports = {
    MESSAGES,
    LIMITS,
    SKIP_REASONS,
}
