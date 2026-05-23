const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

// ══════════════════════════════════════
// CONFIG
// ══════════════════════════════════════
const BOT_TOKEN   = '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU';
const CHAT_ID     = '-1003809922152';
const FIREBASE_URL = 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('✅ Matin Payment Bot started...');

// ══════════════════════════════════════
// PARSE ABA PAYMENT MESSAGE
// ══════════════════════════════════════
function parseABAMessage(text) {
    if (!text) return null;

    // ABA notification format examples:
    // ✅ បានទទួលប្រាក់ / Received / Credited
    const isPayment =
        text.includes('បានទទួល') ||
        text.includes('Received') ||
        text.includes('Credited') ||
        text.includes('credited') ||
        text.includes('received') ||
        text.includes('KHQR') ||
        text.includes('Transfer') ||
        text.includes('ផ្ទេរ');

    if (!isPayment) return null;

    // Extract amount — matches: 5.00, $5.00, USD 5.00, 5,000.00 KHR
    const amountMatch = text.match(/[\$]?\s*([\d,]+\.?\d*)\s*(USD|KHR|usd|khr)?/);
    const amount = amountMatch ? amountMatch[1].replace(',', '') : '0';
    const currency = amountMatch ? (amountMatch[2] || 'USD').toUpperCase() : 'USD';

    // Extract sender name
    const fromMatch = text.match(/(?:From|ពី|from)[:\s]+([^\n]+)/i);
    const sender = fromMatch ? fromMatch[1].trim() : 'Unknown';

    // Extract reference/transaction ID
    const refMatch = text.match(/(?:Ref|Reference|TxnID|Transaction)[:\s#]+([A-Z0-9]+)/i);
    const reference = refMatch ? refMatch[1].trim() : ('TXN' + Date.now());

    return {
        amount: parseFloat(amount),
        currency,
        sender,
        reference,
        timestamp: new Date().toISOString(),
        verified: true,
        raw: text.substring(0, 200)
    };
}

// ══════════════════════════════════════
// SAVE TO FIREBASE
// ══════════════════════════════════════
function saveToFirebase(payment) {
    const key = 'pay_' + Date.now();
    const data = JSON.stringify(payment);
    const path = `/payments/${key}.json`;
    const url = new URL(FIREBASE_URL + path);

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
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                console.log(`✅ Saved to Firebase: ${key} | ${payment.amount} ${payment.currency} from ${payment.sender}`);
                resolve(key);
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ══════════════════════════════════════
// LISTEN FOR MESSAGES
// ══════════════════════════════════════
bot.on('message', async (msg) => {
    // Only process messages from our ABA group
    if (String(msg.chat.id) !== CHAT_ID) return;

    const text = msg.text || msg.caption || '';
    console.log(`📩 Message from group: ${text.substring(0, 80)}`);

    const payment = parseABAMessage(text);
    if (!payment) {
        console.log('⏭ Not a payment message, skipping.');
        return;
    }

    try {
        const key = await saveToFirebase(payment);
        console.log(`💾 Payment saved: ${key}`);
    } catch (err) {
        console.error('❌ Firebase save error:', err.message);
    }
});

bot.on('polling_error', (err) => {
    console.error('Polling error:', err.message);
});
