# Matin Payment Bot

Telegram bot ដែលអាន ABA payment notification ហើយ save ចូល Firebase។

## Deploy លើ Render.com (Free)

### ជំហាន ១ — Upload ទៅ GitHub
1. ចូល github.com → New repository → ឈ្មោះ `matin-bot`
2. Upload files ទាំង ៣: `bot.js`, `package.json`, `render.yaml`

### ជំហាន ២ — Connect Render
1. ចូល render.com → Sign up (ប្រើ GitHub)
2. ចុច **"New"** → **"Web Service"**
3. Connect GitHub repo `matin-bot`
4. Render នឹង detect `render.yaml` ដោយស្វ័យប្រវត្តិ
5. ចុច **Deploy**

### ជំហាន ៣ — Bot រួច!
Bot នឹង run 24/7 free — ពេល ABA ផ្ញើ notification ចូល group
bot នឹង save payment ចូល Firebase ដោយស្វ័យប្រវត្តិ។

## Firebase Data Structure
```
payments/
  pay_1234567890/
    amount: 5.00
    currency: "USD"
    sender: "Chan Dara"
    reference: "TXN123456"
    timestamp: "2026-05-24T..."
    verified: true
```
