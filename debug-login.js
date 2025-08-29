#!/usr/bin/env node

// Debug script to test login functionality
const { getF1tvToken } = require('./lib/f1tv-token');

async function testLogin() {
    console.log('Testing F1TV login with debug mode...');
    console.log('This will open a browser window to help debug login issues');
    console.log('Press Ctrl+C to cancel\n');
    
    try {
        // Enable debug mode to see what's happening
        process.env.F1TV_DEBUG = 'true';
        
        // Test with dummy credentials to see the login flow
        const token = await getF1tvToken('test@test.com', 'testpass', true);
        console.log('Login successful! Token received.');
    } catch (error) {
        console.log('Login failed with error:');
        console.log(error.message);
        console.log('\nThis is expected with dummy credentials, but we can see the login flow.');
    }
}

testLogin();