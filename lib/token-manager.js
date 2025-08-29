const { getF1tvToken } = require('./f1tv-token');
const { autoExtractF1TVCookies } = require('./browser-cookies');
const fs = require('fs');
const path = require('path');

/**
 * Advanced Token Management with Auto-Retry and Refresh
 */

class TokenManager {
    constructor(debug = false) {
        this.debug = debug;
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
        this.tokenCacheFile = path.join(__dirname, '..', '.token-cache.json');
    }

    log(message) {
        if (this.debug) console.log(message);
    }

    // Save token with metadata
    saveTokenToCache(token, source = 'unknown') {
        try {
            const tokenData = {
                token: token,
                source: source,
                timestamp: Date.now(),
                expires: this.extractTokenExpiry(token)
            };
            fs.writeFileSync(this.tokenCacheFile, JSON.stringify(tokenData, null, 2));
            this.log(`💾 Token cached from source: ${source}`);
        } catch (e) {
            this.log(`❌ Failed to cache token: ${e.message}`);
        }
    }

    // Load token from cache if still valid
    loadTokenFromCache() {
        try {
            if (!fs.existsSync(this.tokenCacheFile)) return null;
            
            const tokenData = JSON.parse(fs.readFileSync(this.tokenCacheFile, 'utf8'));
            const now = Date.now();
            
            // Check if token is expired (with 5 minute buffer)
            if (tokenData.expires && (tokenData.expires * 1000) < (now + 300000)) {
                this.log('⏰ Cached token is expired');
                return null;
            }
            
            // Check if token is older than 24 hours
            if (now - tokenData.timestamp > 24 * 60 * 60 * 1000) {
                this.log('⏰ Cached token is too old');
                return null;
            }
            
            this.log(`✅ Using cached token from ${tokenData.source}`);
            return tokenData.token;
        } catch (e) {
            this.log(`❌ Failed to load cached token: ${e.message}`);
            return null;
        }
    }

    // Extract expiry from JWT token
    extractTokenExpiry(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
            return decoded.exp || null;
        } catch (e) {
            return null;
        }
    }

    // Check if token is valid by making a test request
    async validateToken(token) {
        try {
            const axios = require('axios');
            const response = await axios.get('https://f1tv-api.formula1.com/api/content-items', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                },
                timeout: 10000
            });
            return response.status === 200;
        } catch (e) {
            this.log(`❌ Token validation failed: ${e.message}`);
            return false;
        }
    }

    // Get token with multiple fallback strategies
    async getValidToken(user = null, pass = null) {
        this.log('🎯 Getting valid F1TV token...');
        
        // Strategy 1: Check cached token
        this.log('🔍 Strategy 1: Checking cached token...');
        const cachedToken = this.loadTokenFromCache();
        if (cachedToken) {
            const isValid = await this.validateToken(cachedToken);
            if (isValid) {
                this.log('✅ Cached token is valid');
                return cachedToken;
            } else {
                this.log('❌ Cached token is invalid');
            }
        }
        
        // Strategy 2: Auto-extract from browsers
        this.log('🔍 Strategy 2: Auto-extracting from browsers...');
        try {
            const autoToken = await autoExtractF1TVCookies(this.debug);
            if (autoToken) {
                const isValid = await this.validateToken(autoToken);
                if (isValid) {
                    this.saveTokenToCache(autoToken, 'browser-auto-extract');
                    this.log('✅ Auto-extracted token is valid');
                    return autoToken;
                } else {
                    this.log('❌ Auto-extracted token is invalid');
                }
            }
        } catch (e) {
            this.log(`❌ Auto-extraction failed: ${e.message}`);
        }
        
        // Strategy 3: Manual cookie file
        this.log('🔍 Strategy 3: Checking manual cookie file...');
        const manualToken = this.loadManualCookie();
        if (manualToken) {
            const isValid = await this.validateToken(manualToken);
            if (isValid) {
                this.saveTokenToCache(manualToken, 'manual-cookie-file');
                this.log('✅ Manual cookie is valid');
                return manualToken;
            } else {
                this.log('❌ Manual cookie is invalid');
            }
        }
        
        // Strategy 4: Automated login with retry
        if (user && pass) {
            this.log('🔍 Strategy 4: Automated login with retry...');
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    this.log(`🚀 Login attempt ${attempt}/${this.maxRetries}...`);
                    const loginToken = await getF1tvToken(user, pass, this.debug);
                    
                    if (loginToken) {
                        const isValid = await this.validateToken(loginToken);
                        if (isValid) {
                            this.saveTokenToCache(loginToken, 'automated-login');
                            this.log('✅ Automated login successful');
                            return loginToken;
                        } else {
                            this.log('❌ Login token is invalid');
                        }
                    }
                } catch (e) {
                    this.log(`❌ Login attempt ${attempt} failed: ${e.message}`);
                    if (attempt < this.maxRetries) {
                        this.log(`⏳ Waiting ${this.retryDelay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                        this.retryDelay *= 1.5; // Exponential backoff
                    }
                }
            }
        }
        
        throw new Error('All authentication strategies failed. Please check your credentials or try manual cookie extraction.');
    }

    // Load manual cookie file
    loadManualCookie() {
        try {
            const cookieFile = path.join(__dirname, '..', '.f1tv-cookies.json');
            if (fs.existsSync(cookieFile)) {
                const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
                return cookies.entitlement_token || null;
            }
        } catch (e) {
            this.log(`❌ Failed to load manual cookie: ${e.message}`);
        }
        return null;
    }

    // Clear all cached tokens (useful for troubleshooting)
    clearCache() {
        try {
            if (fs.existsSync(this.tokenCacheFile)) {
                fs.unlinkSync(this.tokenCacheFile);
                this.log('🗑️  Token cache cleared');
            }
        } catch (e) {
            this.log(`❌ Failed to clear cache: ${e.message}`);
        }
    }
}

module.exports = { TokenManager };