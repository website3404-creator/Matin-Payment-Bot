const https = require('https');
const http = require('http');

const BOT_TOKEN    = '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU';
const FIREBASE_URL = 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app';
const ADMIN_ID     = '1643504321';
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

// ══════════════════════════════════════
// Send message to Admin with Approve button
// ══════════════════════════════════════
function sendApproveButton(paymentKey, text) {
    const msg = `💰 *ការទូទាត់ថ្មី!*\n\n${text}\n\n_ចុច ✅ Approve ដើម្បីបញ្ជាក់_`;
    const keyboard = JSON.stringify({
        inline_keyboard: [[
            { text: '✅ Approve', callback_data: `approve_${paymentKey}` }
        ]]
    });
    const body = JSON.stringify({
        chat_id: ADMIN_ID,
        text: msg,
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { console.log('📨 Sent to admin'); resolve(d); });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ══════════════════════════════════════
// Save payment to Firebase (pending)
// ══════════════════════════════════════
function savePayment(key, payment) {
    const data = JSON.stringify(payment);
    const url = new URL(`${FIREBASE_URL}/payments/${key}.json`);
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { console.log(`✅ Firebase saved: ${key}`); resolve(d); });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ══════════════════════════════════════
// Approve payment — set verified:true
// ══════════════════════════════════════
function approvePayment(key) {
    return new Promise(async (resolve, reject) => {
        // 1. Get current data
        const getUrl = new URL(`${FIREBASE_URL}/payments/${key}.json`);
        https.get({ hostname: getUrl.hostname, path: getUrl.pathname }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', async () => {
                try {
                    const current = JSON.parse(d);
                    current.verified = true;
                    current.approvedAt = new Date().toISOString();
                    // 2. Update with verified:true
                    await savePayment(key, current);
                    resolve();
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// ══════════════════════════════════════
// Answer callback query (remove loading)
// ══════════════════════════════════════
function answerCallback(callbackQueryId, text) {
    const body = JSON.stringify({ callback_query_id: callbackQueryId, text });
    const req = https.request({
        hostname: 'api.telegram.org',
        path: `/bot${BOT_TOKEN}/answerCallbackQuery`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, () => {});
    req.on('error', () => {});
    req.write(body);
    req.end();
}

// ══════════════════════════════════════
// Parse ABA message
// ══════════════════════════════════════
function parseABAMessage(text) {
    if (!text) return null;
    const isABA =
        text.includes('paid by') ||
        text.includes('ត្រូវបានបង់ដោយ') ||
        text.includes('ABA PAY') ||
        text.includes('APV:') ||
        text.includes('PayWay');
    if (!isABA) return null;

    const amountMatch = text.match(/\$([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

    const senderEN = text.match(/paid by\s+([A-Z\s]+)\s+\(/i);
    const senderKH = text.match(/បង់ដោយ\s+([^\(]+)\s+\(/);
    const sender = senderEN ? senderEN[1].trim() : senderKH ? senderKH[1].trim() : 'Unknown';

    const apvMatch = text.match(/APV[:\s]+(\d+)/);
    const reference = apvMatch ? 'APV' + apvMatch[1] : ('TXN' + Date.now());

    return { amount, currency: 'USD', sender, reference, timestamp: new Date().toISOString(), verified: false };
}

// ══════════════════════════════════════
// HTTP Server — Webhook
// ══════════════════════════════════════
const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const update = JSON.parse(body);

                // Handle Approve button click
                if (update.callback_query) {
                    const cb = update.callback_query;
                    const data = cb.data || '';
                    if (data.startsWith('approve_')) {
                        const key = data.replace('approve_', '');
                        await approvePayment(key);
                        answerCallback(cb.id, '✅ Approved!');
                        console.log(`✅ Approved: ${key}`);
                    }
                }

                // Handle ABA payment message
                const msg = update.message || update.channel_post;
                if (msg) {
                    const text = msg.text || msg.caption || '';
                    console.log(`📩 [${msg.chat.id}] "${text.substring(0, 100)}"`);
                    const payment = parseABAMessage(text);
                    if (payment) {
                        const key = 'pay_' + Date.now();
                        // Save as pending (verified: false)
                        await savePayment(key, payment);
                        // Send to admin with Approve button
                        await sendApproveButton(key, `👤 *${payment.sender}*\n💵 $${payment.amount} USD\n🔖 ${payment.reference}`);
                        console.log(`💰 Payment pending: ${key}`);
                    }
                }
            } catch(e) {
                console.error('Error:', e.message);
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
    console.log('✅ Matin Payment Bot (Admin Approve mode)');
    setTimeout(setWebhook, 3000);
});
