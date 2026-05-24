import asyncio, aiohttp, re, time
from datetime import datetime, timezone
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import os

SESSION   = os.environ.get('SESSION_STRING', '')
FIREBASE  = os.environ.get('FIREBASE_URL', 'https://matin-topup-default-rtdb.asia-southeast1.firebasedatabase.app')
BOT_TOKEN = os.environ.get('BOT_TOKEN', '8572335855:AAHZPf-61Fb7Zwl-LAC3pWHf0ZVoUGsgvFU')
GROUP_ID  = int(os.environ.get('GROUP_ID', '-1003885368836'))

def parse_aba(text):
    if not text: return None
    l = text.lower()
    if not (('paid by' in l and 'aba' in l) or 'via aba pay' in l or 'trx. id' in l or ('apv:' in l and '$' in l)):
        return None
    m = re.search(r'\$\s*([\d,]+\.?\d*)', text)
    if not m: return None
    amount = float(m.group(1).replace(',',''))
    trx  = re.search(r'[Tt]rx\.?\s*[Ii][Dd]:?\s*([\d]+)', text)
    apv  = re.search(r'APV:?\s*([\w]+)', text, re.I)
    paid = re.search(r'paid by ([^(]+)\(', text, re.I)
    return {
        'amount': amount,
        'trxId' : trx.group(1) if trx else f'TRX_{int(time.time())}',
        'apv'   : apv.group(1).rstrip('.') if apv else '',
        'sender': paid.group(1).strip() if paid else 'Unknown'
    }

async def approve(pay, raw):
    async with aiohttp.ClientSession() as s:
        r = await s.get(f'{FIREBASE}/orders.json')
        orders = await r.json()
        if not orders:
            print('No orders in Firebase')
            return
        now   = time.time() * 1000
        best  = None
        bestd = float('inf')
        for k, o in orders.items():
            if o.get('verified') or o.get('rejected'): continue
            if not o.get('price'): continue
            op = float(o.get('price', 0))
            try:
                ot = datetime.fromisoformat(o.get('timestamp','').replace('Z','+00:00')).timestamp()*1000
            except: ot = 0
            td = now - ot
            if op == 0: continue
            if abs(op - pay['amount']) / op > 0.05: continue
            if td > 30*60*1000 or td < 0: continue
            if td < bestd: bestd = td; best = (k, o)

        if not best:
            print(f'❌ No match for ${pay["amount"]}')
            return

        k, o = best
        print(f'✅ Match: {k} ${o["price"]}')

        upd = {**o,
               'verified'    : True,
               'approvedAt'  : datetime.now(timezone.utc).isoformat(),
               'autoApproved': True,
               'matchedTrxId': pay['trxId'],
               'matchedApv'  : pay['apv'],
               'matchedSender': pay['sender']}
        await s.put(f'{FIREBASE}/orders/{k}.json', json=upd)

        inv = {
            'trx'      : o.get('autoRemark', k),
            'game'     : o.get('game', ''),
            'id'       : o.get('id', ''),
            'zone'     : o.get('zone', ''),
            'nickname' : o.get('nickname', ''),
            'pack'     : o.get('pack', ''),
            'price'    : o.get('price', '0'),
            'time'     : o.get('now', ''),
            'approvedAt': upd['approvedAt'],
            'verified' : True,
            'trxId'    : pay['trxId'],
            'apv'      : pay['apv'],
            'sender'   : pay['sender']
        }
        await s.put(f'{FIREBASE}/approved_invoices/inv_{k}.json', json=inv)

        msg = (f'✅ <b>Auto-Approved!</b>\n'
               f'──────────────────\n'
               f'🎮 ហ្គេម: {o.get("game","—")}\n'
               f'👤 ឈ្មោះ: {o.get("nickname","—")}\n'
               f'💎 កញ្ចប់: {o.get("pack","—")}\n'
               f'💰 តម្លៃ: ${float(o.get("price",0)):.2f}\n'
               f'💳 Trx ID: <code>{pay["trxId"]}</code>\n'
               f'🔑 APV: {pay["apv"]}\n'
               f'👤 អ្នកបង់: {pay["sender"]}\n'
               f'🤖 Auto-approved by Listener')

        for cid in ['1643504321', '-1003885368836']:
            try:
                await s.post(
                    f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
                    json={'chat_id': cid, 'text': msg, 'parse_mode': 'HTML'}
                )
            except: pass

        print(f'✅ Auto-approve done: {k}')

async def main():
    print('🚀 MATIN TOPUP Listener starting...')
    client = TelegramClient(StringSession(SESSION), 2040, 'b18441a1ff607e10a989891a5462e627')
    await client.start()
    me = await client.get_me()
    print(f'✅ Logged in: {me.first_name} (@{me.username})')
    print(f'👂 Listening group {GROUP_ID}...')
    print('⏳ Waiting for ABA payments...')

    @client.on(events.NewMessage(chats=GROUP_ID))
    async def handler(e):
        text = e.message.text or ''
        print(f'📨 {text[:80]}')
        pay = parse_aba(text)
        if pay:
            print(f'💰 ABA Payment: ${pay["amount"]} Trx={pay["trxId"]}')
            await approve(pay, text)

    await client.run_until_disconnected()

asyncio.run(main())
