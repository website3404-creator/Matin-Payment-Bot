const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const http = require('http');

const BOT_TOKEN    = '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU';
const FIREBASE_URL = 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app';
const PORT         = process.env.PORT || 3000;

// HTTP server សម្រាប់ Render Free
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Matin Payment Bot ✅');
}).listen(PORT, () => console.log(`🌐 Port ${PORT}`));

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('✅ Matin Payment Bot started...');

// Parse ABA PayWay format:
// $0.49 ត្រូវបានបង់ដោយ CHEA SOK CHAMREUN (*804) នៅថ្ងៃ... APV: 819648
function parseABAMessage(text) {
    if (!text) return null;

    // ABA PayWay keywords
    const isABA =
        text.includes('ត្រូវបានបង់') ||
        text.includes('PayWay') ||
        text.includes('ABA PAY') ||
        text.includes('Received') ||
        text.includes('បានទទួល') ||
        text.includes('APV:') ||
        text.includes('KHQR');

    if (!isABA) return null;

    // Extract amount — $0.49 or 0.49
    const amountMatch = text.match(/\$?([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    // Extract sender name
    const senderMatch = text.match(/បង់ដោយ\s+([A-Z\s]+)\s+\(/) ||
                        text.match(/From[:\s]+([^\n]+)/i);
    const sender = senderMatch ? senderMatch[1].trim() : 'Unknown';

    // Extract APV reference
    const apvMatch = text.match(/APV[:\s]+(\d+)/);
    const reference = apvMatch ? 'APV' + apvMatch[1] : ('TXN' + Date.now());

    console.log(`💰 Payment detected: ${amount} USD from ${sender} ref ${reference}`);

    return {
        amount,
        currency: 'USD',
        sender,
        reference,
        timestamp: new Date().toISOString(),
        verified: true,
        raw: text.substring(0, 300)
    };
}

function saveToFirebase(payment) {
    const key = 'pay_' + Date.now();
    const data = JSON.stringify(payment);
    const url = new URL(`${FIREBASE_URL}/payments/${key}.json`);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                console.log(`✅ Firebase saved: ${key}`);
                resolve(key);
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Listen ALL messages — no chat ID filter
bot.on('message', async (msg) => {
    const text = msg.text || msg.caption || '';
    console.log(`📩 [${msg.chat.id}] ${text.substring(0, 100)}`);

    const payment = parseABAMessage(text);
    if (!payment) return;

    try {
        await saveToFirebase(payment);
    } catch (err) {
        console.error('❌ Firebase error:', err.message);
    }
});

bot.on('polling_error', (err) => {
    console.error('Polling error:', err.message);
});
