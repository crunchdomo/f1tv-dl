const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3');

/**
 * Smart Cookie Auto-Extraction
 * Automatically extracts F1TV cookies from system browsers
 */

const getBrowserPaths = () => {
    const homeDir = os.homedir();
    const platform = os.platform();
    
    const paths = {
        chrome: [],
        safari: [],
        firefox: []
    };
    
    if (platform === 'darwin') { // macOS
        paths.chrome = [
            path.join(homeDir, 'Library/Application Support/Google/Chrome/Default/Cookies'),
            path.join(homeDir, 'Library/Application Support/Google/Chrome/Profile 1/Cookies')
        ];
        paths.safari = [
            path.join(homeDir, 'Library/Cookies/Cookies.binarycookies')
        ];
        paths.firefox = [
            path.join(homeDir, 'Library/Application Support/Firefox/Profiles')
        ];
    } else if (platform === 'win32') { // Windows
        const appData = process.env.APPDATA || path.join(homeDir, 'AppData/Roaming');
        const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData/Local');
        
        paths.chrome = [
            path.join(localAppData, 'Google/Chrome/User Data/Default/Cookies'),
            path.join(localAppData, 'Google/Chrome/User Data/Profile 1/Cookies')
        ];
        paths.firefox = [
            path.join(appData, 'Mozilla/Firefox/Profiles')
        ];
    } else { // Linux
        paths.chrome = [
            path.join(homeDir, '.config/google-chrome/Default/Cookies'),
            path.join(homeDir, '.config/google-chrome/Profile 1/Cookies')
        ];
        paths.firefox = [
            path.join(homeDir, '.mozilla/firefox')
        ];
    }
    
    return paths;
};

const extractChromeF1TVCookies = async (cookiePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(cookiePath)) {
            resolve(null);
            return;
        }
        
        const db = new sqlite3.Database(cookiePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resolve(null);
                return;
            }
        });
        
        const query = `
            SELECT name, value, expires_utc 
            FROM cookies 
            WHERE host_key LIKE '%formula1.com%' 
            AND name = 'entitlement_token'
            ORDER BY creation_utc DESC
            LIMIT 1
        `;
        
        db.get(query, (err, row) => {
            db.close();
            
            if (err || !row) {
                resolve(null);
                return;
            }
            
            // Check if cookie is expired
            const now = Date.now() * 1000; // Chrome uses microseconds
            if (row.expires_utc && row.expires_utc < now) {
                resolve(null);
                return;
            }
            
            resolve({
                name: row.name,
                value: row.value,
                expires: row.expires_utc,
                browser: 'Chrome'
            });
        });
    });
};

const findFirefoxProfiles = (firefoxDir) => {
    if (!fs.existsSync(firefoxDir)) {
        return [];
    }
    
    const profiles = [];
    const items = fs.readdirSync(firefoxDir);
    
    for (const item of items) {
        const profilePath = path.join(firefoxDir, item);
        const cookiesPath = path.join(profilePath, 'cookies.sqlite');
        
        if (fs.existsSync(cookiesPath)) {
            profiles.push(cookiesPath);
        }
    }
    
    return profiles;
};

const extractFirefoxF1TVCookies = async (cookiePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(cookiePath)) {
            resolve(null);
            return;
        }
        
        const db = new sqlite3.Database(cookiePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                resolve(null);
                return;
            }
        });
        
        const query = `
            SELECT name, value, expiry 
            FROM moz_cookies 
            WHERE host LIKE '%formula1.com%' 
            AND name = 'entitlement_token'
            ORDER BY lastAccessed DESC
            LIMIT 1
        `;
        
        db.get(query, (err, row) => {
            db.close();
            
            if (err || !row) {
                resolve(null);
                return;
            }
            
            // Check if cookie is expired
            const now = Math.floor(Date.now() / 1000);
            if (row.expiry && row.expiry < now) {
                resolve(null);
                return;
            }
            
            resolve({
                name: row.name,
                value: row.value,
                expires: row.expiry,
                browser: 'Firefox'
            });
        });
    });
};

const extractSafariF1TVCookies = async (cookiePath) => {
    // Safari cookies are in a binary format that's more complex to parse
    // For now, we'll return null and focus on Chrome/Firefox
    // This could be implemented using a binary parser library
    return null;
};

const autoExtractF1TVCookies = async (debug = false) => {
    if (debug) console.log('🔍 Auto-extracting F1TV cookies from system browsers...');
    
    const browserPaths = getBrowserPaths();
    const cookies = [];
    
    // Try Chrome
    if (debug) console.log('🔍 Checking Chrome browsers...');
    for (const chromePath of browserPaths.chrome) {
        try {
            const cookie = await extractChromeF1TVCookies(chromePath);
            if (cookie) {
                cookies.push(cookie);
                if (debug) console.log(`✅ Found F1TV cookie in Chrome: ${chromePath}`);
            }
        } catch (e) {
            if (debug) console.log(`❌ Chrome extraction failed: ${chromePath} - ${e.message}`);
        }
    }
    
    // Try Firefox
    if (debug) console.log('🔍 Checking Firefox browsers...');
    for (const firefoxDir of browserPaths.firefox) {
        const profilePaths = findFirefoxProfiles(firefoxDir);
        for (const profilePath of profilePaths) {
            try {
                const cookie = await extractFirefoxF1TVCookies(profilePath);
                if (cookie) {
                    cookies.push(cookie);
                    if (debug) console.log(`✅ Found F1TV cookie in Firefox: ${profilePath}`);
                }
            } catch (e) {
                if (debug) console.log(`❌ Firefox extraction failed: ${profilePath} - ${e.message}`);
            }
        }
    }
    
    // Try Safari
    if (debug) console.log('🔍 Checking Safari browsers...');
    for (const safariPath of browserPaths.safari) {
        try {
            const cookie = await extractSafariF1TVCookies(safariPath);
            if (cookie) {
                cookies.push(cookie);
                if (debug) console.log(`✅ Found F1TV cookie in Safari: ${safariPath}`);
            }
        } catch (e) {
            if (debug) console.log(`❌ Safari extraction failed: ${safariPath} - ${e.message}`);
        }
    }
    
    if (cookies.length === 0) {
        if (debug) console.log('ℹ️  No F1TV cookies found in system browsers');
        return null;
    }
    
    // Return the most recent cookie
    const mostRecent = cookies.sort((a, b) => (b.expires || 0) - (a.expires || 0))[0];
    if (debug) console.log(`✅ Using most recent F1TV cookie from ${mostRecent.browser}`);
    
    return mostRecent.value;
};

module.exports = {
    autoExtractF1TVCookies,
    getBrowserPaths,
    extractChromeF1TVCookies,
    extractFirefoxF1TVCookies
};