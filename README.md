# f1tv-dl

Download and watch videos locally from F1TV website

**✅ Now supports Apple M1/M2 Macs!** - Updated with ARM64 compatibility and modern dependencies.

## 🚀 Quick Start

### Prerequisites
- **Node.js** (14+ recommended)
- **FFmpeg** - Required for video processing
  - **Mac (Intel/M1)**: `brew install ffmpeg`
  - **Windows/Linux**: [Download from ffmpeg.org](https://www.ffmpeg.org/)
- **F1TV Pro subscription** - Valid username/password required

### Installation

#### Option 1: Local Development (Recommended for M1 Macs)
```bash
git clone https://github.com/thedave42/f1tv-dl.git
cd f1tv-dl
npm install
```

#### Option 2: Global Installation
```bash
npm i -g @thedave42/f1tv-dl
```

#### Option 3: Docker (cross-platform)
```bash
docker run -v <your local directory>:/download ghcr.io/thedave42/f1tv-dl-docker:latest -o /download <url> [options]
```

## 🔐 Authentication Methods

### Method 1: Manual Cookie Extraction (Recommended)

The most reliable method that bypasses login automation issues:

1. **Extract your F1TV cookies:**
   ```bash
   node extract-cookies.js
   ```

2. **Follow the instructions to:**
   - Login to F1TV manually in your browser
   - Open Developer Tools (F12)
   - Go to Application/Storage → Cookies → https://f1tv.formula1.com
   - Copy the `entitlement_token` cookie value
   - Create `.f1tv-cookies.json` with the format:
   ```json
   {
     "entitlement_token": "your_cookie_value_here"
   }
   ```

3. **Run f1tv-dl normally** - it will automatically use your saved cookie

### Method 2: Environment Variables
```bash
export F1TV_USER="your_email@example.com"
export F1TV_PASS="your_password"
node index.js <url>
```

### Method 3: Interactive Login
Simply run the tool and it will prompt for credentials:
```bash
node index.js <url>
```

## 📖 Usage

```
node index.js <url>

Positionals:
  url  The f1tv url for the video                                       [string]

Options:
      --help                 Show help                                 [boolean]
      --version              Show version number                       [boolean]
  -c, --channel              Choose an alternate channel for a content with
                             multiple video feeds. Use the channel-list option
                             to see a list of channels and specify
                             name/number/tla to select alternate channel.
                                                        [string] [default: null]
  -i, --international-audio  Select a language to include from the INTERNATIONAL
                             feed. This audio will be included in the file as a
                             secondary audio track.
              [string] [choices: "eng", "nld", "deu", "fra", "por", "spa", "fx"]
  -t, --itsoffset            Used to sync secondary audio. Specify the time
                             offset as '(-)hh:mm:ss.SSS'
                                             [string] [default: "-00:00:04.750"]
  -a, --audio-stream         Specify audio stream language to download
                                                       [string] [default: "eng"]
  -s, --video-size           Specify video size to download as WxH or 'best' to
                             select the highest resolution. (e.g. 640x360,
                             1920x1080, best)         [string] [default: "best"]
  -f, --format               Specify mp4 or TS output (default mp4)
                                [string] [choices: "mp4", "ts"] [default: "mp4"]
  -o, --output-directory     Specify a directory for the downloaded file
                                                        [string] [default: null]
  -U, --username             F1TV User name             [string] [default: null]
  -P, --password             F1TV password              [string] [default: null]
      --channel-list         Provides a list of channels available from url (for
                             videos with multiple cameras)
                                                      [boolean] [default: false]
      --stream-url           Return the tokenized URL for use in another
                             application and do not download the video
                                                      [boolean] [default: false]
  -l, --log-level            Set the log level
          [choices: "trace", "debug", "info", "warn", "error"] [default: "info"]
```

## 📝 Examples

### Basic download
```bash
node index.js "https://f1tv.formula1.com/detail/1000006671/2004-hungarian-grand-prix?action=play"
```

### See available camera feeds
```bash
node index.js "https://f1tv.formula1.com/..." --channel-list
```

### Download specific camera feed
```bash
node index.js "https://f1tv.formula1.com/..." -c "Max Verstappen"
# or by number/TLA
node index.js "https://f1tv.formula1.com/..." -c 1
node index.js "https://f1tv.formula1.com/..." -c VER
```

### Download with custom quality and output
```bash
node index.js "https://f1tv.formula1.com/..." -s 1920x1080 -o ~/Downloads/F1Videos
```

### Add international audio track
```bash
node index.js "https://f1tv.formula1.com/..." -i nld  # Dutch
node index.js "https://f1tv.formula1.com/..." -i deu  # German
```

## 🛠️ Environment Variables

- `F1TV_USER` - Your F1TV username/email
- `F1TV_PASS` - Your F1TV password  
- `F1TV_DEBUG` - Set to `true` for detailed debug output

## 🐛 Troubleshooting

### Debug Mode
For detailed troubleshooting information:
```bash
F1TV_DEBUG=true node index.js <url>
```

### Common Issues

**🍪 Cookie consent/login hanging:**
- Use the manual cookie extraction method (Method 1 above)
- This bypasses all browser automation issues

**🔑 401 Unauthorized error:**
- Your authentication token has expired
- Extract a fresh cookie from your browser
- Or delete `.f1tv-cookies.json` to use interactive login

**📱 M1 Mac compatibility:**
- Install ffmpeg via Homebrew: `brew install ffmpeg`
- Use Node.js 14+ (install via nvm if needed)
- The tool now includes ARM64-compatible Puppeteer

**🌐 Network/timeout issues:**
- Increase debug output: `F1TV_DEBUG=true`
- Check your F1TV Pro subscription is active
- Try a different video URL

**🎥 Download fails:**
- Verify the F1TV URL is correct and accessible
- Check if the content requires specific regional access
- Some content may have geographic restrictions

## 🔄 Updates in This Version

- ✅ **Apple M1/M2 Mac support** - Updated Puppeteer and dependencies
- ✅ **Manual cookie extraction** - Reliable alternative to automated login
- ✅ **Improved error handling** - Better debugging and error messages
- ✅ **Updated dependencies** - Latest Puppeteer, FFmpeg bindings
- ✅ **Enhanced cookie consent handling** - Works with modern F1TV website
- ✅ **Debug mode improvements** - Detailed logging for troubleshooting

## 📄 License

ISC

## 🤝 Contributing

Issues and pull requests welcome! This tool is community-maintained.

---

**Note:** This tool requires a valid F1TV Pro subscription. It's designed for personal use to watch content you have legitimate access to.