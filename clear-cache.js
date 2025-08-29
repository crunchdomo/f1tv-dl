#!/usr/bin/env node

/**
 * F1TV Cache and Session Cleaner
 * 
 * Clears all cached tokens, browser sessions, and cookies
 * Useful for troubleshooting authentication issues
 */

const fs = require('fs');
const path = require('path');

const clearCache = () => {
    console.log('🧹 Clearing F1TV authentication cache...\n');
    
    const filesToClear = [
        '.f1tv-cookies.json',
        '.token-cache.json'
    ];
    
    const dirsToClear = [
        '.browser-sessions'
    ];
    
    let clearedCount = 0;
    
    // Clear files
    for (const file of filesToClear) {
        const filePath = path.join(__dirname, file);
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`✅ Deleted: ${file}`);
                clearedCount++;
            }
        } catch (e) {
            console.log(`❌ Failed to delete ${file}: ${e.message}`);
        }
    }
    
    // Clear directories
    for (const dir of dirsToClear) {
        const dirPath = path.join(__dirname, dir);
        try {
            if (fs.existsSync(dirPath)) {
                fs.rmSync(dirPath, { recursive: true, force: true });
                console.log(`✅ Deleted directory: ${dir}`);
                clearedCount++;
            }
        } catch (e) {
            console.log(`❌ Failed to delete ${dir}: ${e.message}`);
        }
    }
    
    if (clearedCount === 0) {
        console.log('ℹ️  No cache files found to clear');
    } else {
        console.log(`\n🎉 Cleared ${clearedCount} cache items`);
    }
    
    console.log('\n💡 Next steps:');
    console.log('   - Try running f1tv-dl again');
    console.log('   - Or extract fresh cookies with: node extract-cookies.js');
    console.log('   - Use debug mode for troubleshooting: F1TV_DEBUG=true node index.js <url>');
};

clearCache();