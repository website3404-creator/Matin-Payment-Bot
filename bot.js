const https = require('https');
const http = require('http');

const BOT_TOKEN    = '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU';
const FIREBASE_URL = 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app';
const PORT         = process.env.PORT || 10000;
const RENDER_URL   = 'https://matin-payment-bot.onrender.com';

// ══════════════════════════════════════
// Set Webhook ពេល start
// ══════════════════════════════════════
function setWebhook() {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${RENDER_URL}/webhook&drop_pending_updates=true`;
    https.get(url, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => console.log('✅ Webhook set:', body));
    }).on('error', e => console.error('Webhook error:', e.message));
}

// ══════════════════════════════════════
// Parse ABA PayWay message
// ══════════════════════════════════════
function parseABAMessage(text) {
    if (!text) return null;

    const isABA =
        text.includes('ត្រូវបានបង់') ||
        text.includes('PayWay') ||
        text.includes('ABA PAY') ||
        text.includes('ABA') ||
        text.includes('APV:') ||
        text.includes('បានទទួល') ||
        text.includes('Received') ||
        text.includes('KHQR');

    if (!isABA) return null;

    const amountMatch = text.match(/\$?([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    const senderMatch = text.match(/បង់ដោយ\s+([A-Z\s]+)\s+\(/) ||
                        text.match(/From[:\s]+([^\n]+)/i);
    const sender = senderMatch ? senderMatch[1].trim() : 'Unknown';

    const apvMatch = text.match(/APV[:\s]+(\d+)/);
    const reference = apvMatch ? 'APV' + apvMatch[1] : ('TXN' + Date.now());

    console.log(`💰 Payment: $${amount} from ${sender} ref ${reference}`);

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

// ══════════════════════════════════════
// Save to Firebase
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// HTTP Server — Webhook receiver
// ══════════════════════════════════════
const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const update = JSON.parse(body);
                const msg = update.message || update.channel_post;
                if (msg) {
                    const text = msg.text || msg.caption || '';
                    console.log(`📩 [${msg.chat.id}] ${text.substring(0, 100)}`);
                    const payment = parseABAMessage(text);
                    if (payment) {
                        await saveToFirebase(payment);
                    }
                }
            } catch(e) {
                console.error('Parse error:', e.message);
            }
            res.writeHead(200);
            res.end('OK');
        });
    } else {
        res.writeHead(200);
        res.end('Matin Payment Bot ✅ Running');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    console.log('✅ Matin Payment Bot started (Webhook mode)');
    // Set webhook after 3s ដើម្បីឲ្យ server start មុន
    setTimeout(setWebhook, 3000);
});
