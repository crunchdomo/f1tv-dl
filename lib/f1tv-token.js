const config = require('./config');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const AdblockerPlugin = require('puppeteer-extra-plugin-adblocker');
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
const fs = require('fs');
const path = require('path');

const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min)) + min;
};

const loadManualCookies = () => {
    const cookieFile = path.join(__dirname, '..', '.f1tv-cookies.json');
    try {
        if (fs.existsSync(cookieFile)) {
            const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
            if (cookies.entitlement_token) {
                return cookies.entitlement_token;
            }
        }
    } catch (e) {
        // Ignore errors, fall back to automated login
    }
    return null;
};

const getF1tvToken = async (user, pass, debugMode = false) => {
    const debug = debugMode || process.env.F1TV_DEBUG === 'true';
    
    // First, try to load manually extracted cookies
    if (debug) console.log('🔍 Checking for manually extracted cookies...');
    const manualToken = loadManualCookies();
    if (manualToken) {
        if (debug) console.log('✅ Found manual cookie! Skipping automated login.');
        if (debug) console.log('💡 Using saved authentication token from .f1tv-cookies.json');
        return manualToken;
    }
    
    if (debug) console.log('❌ No manual cookies found, proceeding with automated login...');
    if (debug) console.log('💡 Tip: Run "node extract-cookies.js" for manual cookie extraction instructions');
    if (debug) console.log('🚀 Starting F1TV automated login process...');
    if (debug) console.log(`📱 Browser headless mode: ${debug ? 'OFF (visible)' : 'ON (hidden)'}`);
    
    const browser = await puppeteer.launch({
        headless: debug ? false : config.HEADLESS,
        args: [
            '--disable-web-security',
            '--window-size=1400,900',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        defaultViewport: {
            width: 1400,
            height: 900
        }
    });
    const page = await browser.newPage();
    
    // Add better user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    if (debug) console.log(`🌐 Navigating to F1TV: ${config.BASE_URL}`);
    await page.goto(config.BASE_URL, { timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' });
    if (debug) {
        console.log('✅ Successfully loaded F1TV homepage');
        await getScreenshot(page, '01-homepage');
    }
    
    // FIRST: Handle cookie consent popup that appears immediately on homepage
    if (debug) console.log('🍪 Looking for cookie consent dialog on homepage...');
    
    // XPath selectors for text-based searches
    const consentXPaths = [
        '//button[contains(text(), "Accept all")]',
        '//button[contains(text(), "accept all")]',
        '//button[contains(text(), "ACCEPT ALL")]',
        '//*[@class="cookie-banner"]//button[contains(text(), "Accept all")]',
        '//*[@class="cookie-banner"]//button[contains(text(), "accept all")]',
        '//button[contains(text(), "Accept")]',
        '//button[contains(text(), "Accept All")]'
    ];
    
    // CSS selectors for class/id based searches
    const consentCSSSelectors = [
        '.cookie-banner button',
        '.cookie-banner [role="button"]',
        '.cookie-banner a',
        '[data-testid="accept-all-cookies"]',
        '[data-testid="accept-cookies"]',
        'button[id*="accept"]',
        'button[class*="accept"]',
        '.cookies-accept',
        '.cookie-consent-accept',
        '#cookieConsentAcceptButton',
        '[id*="cookie"] button',
        '[class*="cookie"] button',
        'button[onclick*="cookie"]',
        '.gdpr-accept',
        '#accept-cookies',
        '#truste-consent-button'
    ];
    
    let consentHandled = false;
    
    // Try XPath selectors first (for text-based searches)
    for (let i = 0; i < consentXPaths.length; i++) {
        const xpath = consentXPaths[i];
        if (debug) console.log(`🍪 Trying XPath selector ${i + 1}/${consentXPaths.length}: ${xpath}`);
        
        try {
            await page.waitForXPath(xpath, { timeout: 3000 });
            if (debug) console.log(`✅ Found cookie consent button with XPath: ${xpath}`);
            const [button] = await page.$x(xpath);
            await button.click();
            await page.waitForTimeout(2000);
            if (debug) console.log('✅ Successfully clicked cookie consent button');
            consentHandled = true;
            break;
        } catch (e) {
            if (debug) console.log(`❌ XPath selector failed: ${xpath}`);
            continue;
        }
    }
    
    // If XPath selectors didn't work, try CSS selectors
    if (!consentHandled) {
        for (let i = 0; i < consentCSSSelectors.length; i++) {
            const selector = consentCSSSelectors[i];
            if (debug) console.log(`🍪 Trying CSS selector ${i + 1}/${consentCSSSelectors.length}: ${selector}`);
            
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                if (debug) console.log(`✅ Found cookie consent button with CSS: ${selector}`);
                await page.click(selector);
                await page.waitForTimeout(2000);
                if (debug) console.log('✅ Successfully clicked cookie consent button');
                consentHandled = true;
                break;
            } catch (e) {
                if (debug) console.log(`❌ CSS selector failed: ${selector}`);
                continue;
            }
        }
    }
    
    if (!consentHandled) {
        if (debug) console.log('ℹ️  No cookie consent dialog found on homepage');
    }
    
    if (debug) await getScreenshot(page, '02-after-consent');
    
    // NOW: Try to find and click the sign-in button (should be unblocked now)
    if (debug) console.log('🔍 Looking for sign-in button...');
    const signInSelectors = [
        'a[title="Sign in"]',
        'button[title="Sign in"]',
        '[data-testid="sign-in"]',
        'a[href*="login"]',
        'button[href*="login"]',
        'a:contains("Sign in")',
        'button:contains("Sign in")',
        'a:contains("Log in")',
        'button:contains("Log in")',
        '.sign-in',
        '.login-button',
        '[class*="sign"]',
        '[class*="login"]'
    ];
    
    let signInClicked = false;
    for (let i = 0; i < signInSelectors.length; i++) {
        const selector = signInSelectors[i];
        if (debug) console.log(`🎯 Trying selector ${i + 1}/${signInSelectors.length}: ${selector}`);
        
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            if (debug) console.log(`✅ Found sign-in element with selector: ${selector}`);
            
            await Promise.all([
                page.click(selector),
                page.waitForNavigation({ timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' })
            ]);
            
            if (debug) console.log('✅ Successfully clicked sign-in and navigated to login page');
            signInClicked = true;
            break;
        } catch (e) {
            if (debug) console.log(`❌ Selector failed: ${selector} - ${e.message}`);
            continue;
        }
    }
    
    if (!signInClicked) {
        if (debug) {
            console.log('❌ Could not find any sign-in button');
            console.log('📸 Taking screenshot of current page for debugging...');
            await getScreenshot(page, '02-no-signin-button');
        }
        await browser.close();
        throw new Error('Could not find sign-in button on F1TV homepage. Check debug screenshots.');
    }
    if (debug) await getScreenshot(page, '03-login-page');
    
    // Wait a bit for page to settle
    const waitTime = getRandomInt(1000, 3000);
    if (debug) console.log(`⏳ Waiting ${waitTime}ms for page to settle...`);
    await page.waitForTimeout(waitTime);
    
    // Try to find username field
    if (debug) console.log('📧 Looking for username/email field...');
    const usernameSelectors = [
        'input[name="Login"]',
        'input[name="login"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[type="email"]',
        'input[placeholder*="email"]',
        'input[placeholder*="username"]',
        '#login',
        '#email',
        '#username'
    ];
    
    let usernameField = null;
    for (let i = 0; i < usernameSelectors.length; i++) {
        const selector = usernameSelectors[i];
        if (debug) console.log(`📧 Trying username selector ${i + 1}/${usernameSelectors.length}: ${selector}`);
        
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            usernameField = selector;
            if (debug) console.log(`✅ Found username field with selector: ${selector}`);
            break;
        } catch (e) {
            if (debug) console.log(`❌ Username selector failed: ${selector}`);
            continue;
        }
    }
    
    if (!usernameField) {
        if (debug) {
            console.log('❌ Could not find username field');
            await getScreenshot(page, '05-no-username-field');
        }
        await browser.close();
        throw new Error('Could not find username field on login page. Check debug screenshots.');
    }
    
    // Type username
    if (debug) console.log(`📧 Typing username into field: ${usernameField}`);
    await page.type(usernameField, user);
    if (debug) await getScreenshot(page, '06-username-entered');
    
    await page.waitForTimeout(getRandomInt(1000, 3000));
    
    // Try to find password field
    if (debug) console.log('🔒 Looking for password field...');
    const passwordSelectors = [
        'input[name="Password"]',
        'input[name="password"]',
        'input[type="password"]',
        '#password',
        '#Password'
    ];
    
    let passwordField = null;
    for (let i = 0; i < passwordSelectors.length; i++) {
        const selector = passwordSelectors[i];
        if (debug) console.log(`🔒 Trying password selector ${i + 1}/${passwordSelectors.length}: ${selector}`);
        
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            passwordField = selector;
            if (debug) console.log(`✅ Found password field with selector: ${selector}`);
            break;
        } catch (e) {
            if (debug) console.log(`❌ Password selector failed: ${selector}`);
            continue;
        }
    }
    
    if (!passwordField) {
        if (debug) {
            console.log('❌ Could not find password field');
            await getScreenshot(page, '07-no-password-field');
        }
        await browser.close();
        throw new Error('Could not find password field on login page. Check debug screenshots.');
    }
    
    // Type password
    if (debug) console.log(`🔒 Typing password into field: ${passwordField}`);
    await page.type(passwordField, pass);
    if (debug) await getScreenshot(page, '08-password-entered');
    
    await page.waitForTimeout(getRandomInt(1000, 3000));
    
    // Try to find and click submit button
    if (debug) console.log('🚀 Looking for submit button...');
    const submitSelectors = [
        'button.btn.btn-primary',
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("Sign in")',
        'button:contains("Log in")',
        'button:contains("Login")',
        '.submit-button',
        '.login-submit',
        '#submit',
        'form button'
    ];
    
    let submitClicked = false;
    for (let i = 0; i < submitSelectors.length; i++) {
        const selector = submitSelectors[i];
        if (debug) console.log(`🚀 Trying submit selector ${i + 1}/${submitSelectors.length}: ${selector}`);
        
        try {
            await page.waitForSelector(selector, { timeout: 5000 });
            if (debug) console.log(`✅ Found submit button with selector: ${selector}`);
            
            await Promise.all([
                page.click(selector),
                page.waitForNavigation({ timeout: config.TOKEN_NETWORK_TIMEOUT, waitUntil: 'networkidle0' })
            ]);
            
            if (debug) console.log('✅ Successfully clicked submit button and navigated');
            submitClicked = true;
            break;
        } catch (e) {
            if (debug) console.log(`❌ Submit selector failed: ${selector} - ${e.message}`);
            continue;
        }
    }
    
    if (!submitClicked) {
        if (debug) {
            console.log('❌ Could not find or click submit button');
            await getScreenshot(page, '09-no-submit-button');
        }
        await browser.close();
        throw new Error('Could not find submit button on login page. Check debug screenshots.');
    }

    // Extract authentication token from cookies
    if (debug) console.log('🍪 Extracting authentication tokens...');
    const cookies = await page.cookies();
    
    if (debug) {
        console.log(`🍪 Found ${cookies.length} cookies total`);
        console.log('🍪 Cookie names:', cookies.map(c => c.name).join(', '));
    }
    
    // Try multiple possible token names
    const tokenNames = ['entitlement_token', 'auth_token', 'session_token', 'access_token', 'login_token'];
    let loginSession = null;
    
    for (const tokenName of tokenNames) {
        loginSession = cookies.find(el => el.name === tokenName);
        if (loginSession) {
            if (debug) console.log(`✅ Found authentication token: ${tokenName}`);
            break;
        }
    }

    if (debug) await getScreenshot(page, '10-final-page');
    
    await browser.close();

    if (!loginSession) {
        const cookieNames = cookies.map(c => c.name).join(', ');
        throw new Error(`Authentication token not found. Available cookies: ${cookieNames}`);
    }
    
    if (debug) console.log('🎉 Login process completed successfully!');
    return loginSession.value;
}

const getScreenshot = async (page, section='default') => {
    return page.screenshot({
        path: `chromium_page_${section}.png`
    });
};

module.exports = {
    getF1tvToken
}
