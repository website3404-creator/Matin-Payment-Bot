const https = require('https');
const http = require('http');

const BOT_TOKEN    = '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU';
const FIREBASE_URL = 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app';
const PORT         = process.env.PORT || 10000;
const RENDER_URL   = 'https://matin-payment-bot.onrender.com';

function setWebhook() {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${RENDER_URL}/webhook&drop_pending_updates=true`;
    https.get(url, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => console.log('✅ Webhook set:', body));
    }).on('error', e => console.error('Webhook error:', e.message));
}

function parseABAMessage(text) {
    if (!text) return null;

    // ABA PayWay formats:
    // EN: "$0.49 paid by NAME (*804) on May 24... APV: 730532"
    // KH: "$0.49 ត្រូវបានបង់ដោយ NAME (*804) នៅថ្ងៃ... APV: 819648"
    const isABA =
        text.includes('paid by') ||
        text.includes('ត្រូវបានបង់ដោយ') ||
        text.includes('ABA PAY') ||
        text.includes('APV:') ||
        text.includes('PayWay') ||
        text.includes('ABA');

    if (!isABA) return null;

    // Extract amount: $0.49 or $1.00
    const amountMatch = text.match(/\$([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    // Extract sender: "paid by NAME (*804)" or "បង់ដោយ NAME (*804)"
    const senderEN = text.match(/paid by\s+([A-Z\s]+)\s+\(/i);
    const senderKH = text.match(/បង់ដោយ\s+([^\(]+)\s+\(/);
    const sender = senderEN ? senderEN[1].trim() :
                   senderKH ? senderKH[1].trim() : 'Unknown';

    // Extract APV
    const apvMatch = text.match(/APV[:\s]+(\d+)/);
    const reference = apvMatch ? 'APV' + apvMatch[1] : ('TXN' + Date.now());

    // Extract Trx ID
    const trxMatch = text.match(/Trx\.?\s*ID[:\s]+(\d+)/i);
    const trxId = trxMatch ? trxMatch[1] : '';

    console.log(`💰 Payment: $${amount} from ${sender} | APV: ${reference} | Trx: ${trxId}`);

    return {
        amount,
        currency: 'USD',
        sender,
        reference,
        trxId,
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
                    console.log(`📩 [${msg.chat.id}] "${text.substring(0, 120)}"`);
                    const payment = parseABAMessage(text);
                    if (payment) {
                        await saveToFirebase(payment);
                    } else {
                        console.log('⏭ Not ABA payment');
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
    console.log(`🌐 Port ${PORT}`);
    console.log('✅ Matin Payment Bot started (Webhook mode)');
    setTimeout(setWebhook, 3000);
});
