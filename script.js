require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_URL = process.env.TARGET_URL || 'https://indsmart.com/register';
const INPUT_SELECTOR = process.env.INPUT_SELECTOR || '#mobile_number';
const BUTTON_SELECTOR = process.env.BUTTON_SELECTOR || '#register_btn';
const SUCCESS_TEXT = process.env.SUCCESS_TEXT || 'Registration successful';

let isRunning = false;
let numberQueue = [];
let currentIndex = 0;

app.post('/start', (req, res) => {
    if (isRunning) return res.json({ status: 'already running' });
    const { numbers } = req.body;
    if (!numbers || !numbers.trim()) return res.json({ status: 'error', msg: 'No numbers' });
    numberQueue = numbers.split(/[\n,]+/).map(n => n.trim()).filter(n => n);
    currentIndex = 0;
    isRunning = true;
    res.json({ status: 'started', total: numberQueue.length });
    runAutomation(); // non-blocking
});

app.post('/stop', (req, res) => {
    isRunning = false;
    res.json({ status: 'stopped' });
});

app.get('/status', (req, res) => {
    res.json({ isRunning, current: currentIndex, total: numberQueue.length });
});

async function sendToTelegram(phone) {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `✅ Registered number: ${phone}`
        });
        console.log(`Telegram sent for ${phone}`);
    } catch (err) {
        console.error(`Telegram error: ${err.message}`);
    }
}

async function runAutomation() {
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        while (isRunning && currentIndex < numberQueue.length) {
            const number = numberQueue[currentIndex];
            console.log(`Processing ${currentIndex+1}/${numberQueue.length}: ${number}`);
            const page = await browser.newPage();
            try {
                await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector(INPUT_SELECTOR, { timeout: 10000 });
                await page.type(INPUT_SELECTOR, number);
                await page.click(BUTTON_SELECTOR);
                await page.waitForTimeout(4000);
                const body = await page.evaluate(() => document.body.innerText);
                if (body.toLowerCase().includes(SUCCESS_TEXT.toLowerCase())) {
                    console.log(`✅ Registered: ${number}`);
                    await sendToTelegram(number);
                } else {
                    console.log(`❌ Failed: ${number}`);
                }
            } catch (err) {
                console.error(`Error on ${number}: ${err.message}`);
            } finally {
                await page.close();
            }
            currentIndex++;
        }
    } catch (err) {
        console.error('Browser error:', err);
    } finally {
        if (browser) await browser.close();
        isRunning = false;
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));