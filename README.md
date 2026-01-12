# Discord Music Bot

A Discord music bot that plays YouTube music with Vietnamese song filtering capabilities.

## Features

- 🎵 **Play music from YouTube** - URLs or search queries
- 📋 **Playlist support** - Regular playlists and personalized Mix/Radio playlists
- 🇻🇳 **Vietnamese song filtering** - Automatically filters songs based on Vietnamese characters and configurable singer/title lists
- ⏯️ **Playback controls** - Play, pause, resume, skip, stop
- 📝 **Queue management** - View, clear, and manage the song queue
- 🔄 **Live filter reloading** - Edit `filters.json` while the bot is running
- 🍪 **Cookie support** - For personalized YouTube playlists
- 🔒 **Server restriction** - Limit bot to specific Discord servers

## Project Structure

```
discord-music-bot/
├── index.js           # Main entry point - Discord client setup, event handlers
├── filters.json       # Configurable song filters (singers, allowed/forbidden titles)
├── cookies.txt        # YouTube cookies for personalized playlists (optional)
├── .env               # Environment variables (Discord token, YouTube API key, allowed servers)
├── src/
│   ├── constants.js   # Messages, limits, and skip reasons
│   ├── logger.js      # Logging functions
│   ├── filters.js     # Song filtering logic with file watcher
│   ├── youtube.js     # YouTube API & yt-dlp integration
│   ├── player.js      # Audio player management
│   └── commands.js    # Command handlers
└── logs/
    ├── bot.log        # General bot logs
    └── skipped_songs.log  # Log of skipped songs
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v16.9.0 or higher)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) executable in the project folder
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH
- Discord Bot Token
- YouTube Data API v3 Key

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd discord-music-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   YOUTUBE_API_KEY=your_youtube_api_key
   ALLOWED_SERVER_IDS=server_id_1,server_id_2
   ```
   
   > **Note:** `ALLOWED_SERVER_IDS` is optional. If not set, the bot will work in all servers. To restrict the bot to specific servers, add comma-separated server IDs.

4. (Optional) Add `cookies.txt` for personalized YouTube playlists:
   - Export cookies from your browser using an extension like "Get cookies.txt LOCALLY"
   - Place the `cookies.txt` file in the project folder

5. Download [yt-dlp.exe](https://github.com/yt-dlp/yt-dlp/releases) and place it in the project folder

## Usage

Start the bot:
```bash
node index.js
```

### Commands

| Command | Description |
|---------|-------------|
| `c.p <url/query>` | Play a YouTube video or search query. Supports playlist URLs. |
| `c.queue` | Display the current song queue |
| `c.n` | Skip to the next song |
| `c.c` | Clear the queue (keeps current song playing) |
| `c.s` | Stop playback, clear queue, and leave the voice channel |
| `c.pause` | Pause the current song |
| `c.resume` | Resume playback |

### Examples

```
c.p https://www.youtube.com/watch?v=dQw4w9WgXcQ
c.p never gonna give you up
c.p https://www.youtube.com/watch?v=xxx&list=PLxxx
```

## Configuration

### filters.json

Configure which songs are allowed or blocked:

```json
{
  "singers": ["VSTRA", "WREN EVANS"],
  "allowedTitles": ["specific song title"],
  "forbiddenTitles": ["blocked artist name"]
}
```

**Filter chain order:**
1. ✅ If singer matches → Allow
2. ✅ If allowed title matches → Allow
3. ❌ If forbidden title matches → Skip
4. ✅ If contains Vietnamese characters → Allow
5. ❌ Otherwise → Skip

The bot watches `filters.json` for changes and reloads automatically.

### constants.js

Customize bot messages and limits in `src/constants.js`:

```javascript
const MESSAGES = {
    NOW_PLAYING: (title) => `🎵 Now playing: **${title}**`,
    QUEUE_EMPTY: '**Queue is empty!**',
    // ... more messages
}

const LIMITS = {
    PLAYLIST_MAX_SONGS: 20,    // Max songs to fetch from a playlist
    QUEUE_MAX_SONGS: 50,       // Max songs in queue
    DISCONNECT_TIMEOUT_MS: 60000,  // Auto-disconnect timeout
}
```

## Personalized Playlists

To fetch personalized YouTube Mix/Radio playlists (URLs containing `list=RD`):

1. **Option A: cookies.txt file**
   - Export cookies from your browser
   - Save as `cookies.txt` in the project folder

2. **Option B: Browser cookie extraction**
   - The bot can extract cookies directly from Edge browser
   - Configure `browserForCookies` in `src/youtube.js`

## Logs

- `logs/bot.log` - All bot activity
- `logs/skipped_songs.log` - Songs that were filtered out

Logs are cleared on each bot restart.

## License

MIT

