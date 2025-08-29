#!/usr/bin/env node

/**
 * F1TV Cookie Extractor
 * 
 * This script helps you manually extract F1TV authentication cookies
 * to bypass the problematic automated login process.
 */

console.log('🍪 F1TV Manual Cookie Extractor\n');
console.log('Follow these steps to extract your F1TV authentication cookies:\n');

console.log('📋 STEP 1: Login to F1TV manually');
console.log('   1. Open Chrome/Safari and go to https://f1tv.formula1.com');
console.log('   2. Click "Sign in" and login with your credentials');
console.log('   3. Make sure you\'re fully logged in (you should see your account)\n');

console.log('📋 STEP 2: Extract the authentication cookie');
console.log('   1. Press F12 (or Cmd+Option+I on Mac) to open Developer Tools');
console.log('   2. Go to the "Application" tab (or "Storage" tab in Firefox)');
console.log('   3. In the sidebar, click "Cookies" → "https://f1tv.formula1.com"');
console.log('   4. Look for a cookie named "entitlement_token"');
console.log('   5. Copy the entire VALUE of that cookie (it will be a long string)\n');

console.log('📋 STEP 3: Save the cookie');
console.log('   1. Create a file called ".f1tv-cookies.json" in this directory');
console.log('   2. Put this content in the file:');
console.log('   {');
console.log('     "entitlement_token": "YOUR_COPIED_COOKIE_VALUE_HERE"');
console.log('   }\n');

console.log('📋 STEP 4: Test with f1tv-dl');
console.log('   Now run f1tv-dl normally - it will use your saved cookie instead of logging in!\n');

console.log('💡 Tips:');
console.log('   - The cookie is valid for several days/weeks');
console.log('   - If downloads stop working, extract a fresh cookie');
console.log('   - Keep the .f1tv-cookies.json file private (contains your auth token)\n');

console.log('❓ Troubleshooting:');
console.log('   - If you don\'t see "entitlement_token", try other cookies like:');
console.log('     • auth_token');
console.log('     • session_token'); 
console.log('     • login_token');
console.log('   - Make sure you\'re logged in before extracting cookies');
console.log('   - Try refreshing the F1TV page and extracting again\n');