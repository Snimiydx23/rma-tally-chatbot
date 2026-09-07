# TallyPrime Multi-Client Chatbot — RMA Finance

## Architecture
```
[Client Tally #1] --agent--\
[Client Tally #2] --agent---> [Central API (FastAPI) + PostgreSQL] --> [Query Engine (Hybrid)]
[Client Tally #N] --agent--/                                                |
                                                                    +--------+--------+
                                                                    |                 |
                                                              [WhatsApp Bot]    [Web Dashboard]
```

## Deployment — GitHub + Render (Production)

Repo structure aisa hai ki Render Blueprint (`render.yaml`) 3 services + 1 Postgres DB
automatically bana deta hai — central API, WhatsApp bot, web dashboard. Sab alag-alag
Render services hain, apne apne URL ke saath.

### Steps:
1. Ye poora `tally-chatbot/` folder ek naye GitHub repo me push karo:
   ```bash
   cd tally-chatbot
   git init
   git add .
   git commit -m "Initial commit — Tally multi-client chatbot"
   git branch -M main
   git remote add origin https://github.com/<your-username>/tally-chatbot.git
   git push -u origin main
   ```

2. Render dashboard me: **New → Blueprint** → apna GitHub repo select karo. Render
   `render.yaml` ko detect karke 3 services + DB automatically create karega.

3. Deploy hone ke baad Render dashboard me jaake ye env vars manually fill karo
   (security ke liye ye blueprint me `sync: false` rakhe gaye hain, GitHub me commit nahi hote):
   - `tally-central-api` service → `ANTHROPIC_API_KEY`
   - `tally-whatsapp-bot` service → `MAYTAPI_PRODUCT_ID`, `MAYTAPI_PHONE_ID`, `MAYTAPI_TOKEN`,
     aur `CENTRAL_API_URL` = `tally-central-api` ka onrender.com URL (Render dashboard me
     us service ke top pe dikh jayega, e.g. `https://tally-central-api.onrender.com`)

4. `tally-web-dashboard` deploy hone ke baad uska URL milega
   (e.g. `https://tally-web-dashboard.onrender.com`). Ye URL:
   - `web_dashboard/config.js` me `CENTRAL_API_URL` update karke central API ka URL daalo, commit + push karo (auto-redeploy ho jayega)
   - Central API service ke `ALLOWED_ORIGINS` env var me dashboard ka yahi URL daalo (CORS ke liye), taaki sirf ye dashboard hi API call kar sake

5. DB schema apply karo — Render Postgres ka external connection string dashboard se copy karke:
   ```bash
   psql "<render-postgres-external-connection-string>" < schema.sql
   ```

6. Maytapi dashboard me webhook URL set karo: `https://tally-whatsapp-bot.onrender.com/webhook/whatsapp`

**Note**: Render free plan pe services 15 min inactivity ke baad sleep ho jaate hain aur
next request pe cold-start lagta hai (~30-50 sec). Production-stable chahiye to paid
plan (Starter, $7/mo) le lena — client-facing WhatsApp bot ke liye recommended hai.

---

## Local Development Setup

### 1. Database
```bash
createdb tally_chatbot
psql tally_chatbot < schema.sql
```
Har client ke liye ek row `clients` table me insert karo, ek unique `api_key` generate karke:
```sql
INSERT INTO clients (company_name, api_key) VALUES ('Sharma Traders', 'random-secure-key-1');
```

### 2. Central API
```bash
cd central_api
pip install -r requirements.txt
export DATABASE_URL="postgresql://user:pass@host/tally_chatbot"
export ANTHROPIC_API_KEY="sk-ant-..."
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Tally Agent (har client machine pe)
1. TallyPrime me: F1 → Settings → Connectivity → Enable HTTP/ODBC Server = Yes, Port = 9000
2. `tally_agent/config.example.json` ko `config.json` bana ke us client ka `api_key` aur `central_api_url` daalo
3. Windows Task Scheduler me har 30 min pe chalao:
   ```
   python tally_extractor.py --config config.json
   ```

### 4. WhatsApp Bot
```bash
cd whatsapp
export MAYTAPI_PRODUCT_ID=... MAYTAPI_PHONE_ID=... MAYTAPI_TOKEN=...
export CENTRAL_API_URL="https://your-central-api.example.com"
python whatsapp_bot.py
```
Maytapi dashboard me webhook URL set karo: `https://<your-server>/webhook/whatsapp`

Staff ko `staff_access` table me map karo taaki wo sirf apne assigned clients ka data dekh sake:
```sql
INSERT INTO staff_access (staff_phone, client_id, role) VALUES ('91XXXXXXXXXX', 1, 'viewer');
```

### 5. Web Dashboard (Local test)
`web_dashboard/index.html` ko directly browser me kholo (ya `python -m http.server` se serve karo).
Ye standalone chat page hai — FMS portal se bilkul alag, apna khud ka URL hoga
production me. `config.js` me central API ka URL set karna zaroori hai.

## Rollout Plan (Bulk — All Clients)
1. **Pilot (Week 1-2)**: 2-3 clients pe agent deploy karo, sync verify karo, WhatsApp se test queries chalao
2. **Batch rollout (Week 3-5)**: Baaki clients ko batches me add karo (10-15 per batch), har client ka `staff_access` map karo
3. **Monitoring**: `sync_log` table regularly check karo failed syncs ke liye
4. **Web dashboard integration**: Pilot ke baad FMS portal me chat widget add karo

## Security Checklist
- [ ] Har client ka alag `api_key` — kabhi share na ho
- [ ] Central API HTTPS ke peeche ho (reverse proxy — nginx/Caddy)
- [ ] `staff_access` table se strict client-wise access control
- [ ] Tally XML port 9000 sirf localhost pe bind ho, agent bhi usi machine pe chale — port ko internet-facing kabhi na rakhein
- [ ] LLM fallback SQL sirf SELECT allow karta hai (already enforced in query_engine.py) — is guard ko kabhi remove na karein
- [ ] DB backups daily schedule karo

## Known Limitations / Next Steps
- Voucher/Outstanding XML tags TallyPrime version ke hisaab se thoda vary kar sakte hain — pehle ek sample client pe raw XML output verify karo aur `tally_extractor.py` ke parsing tags adjust karo
- Currently sync poll-based hai (30 min interval) — real-time nahi. Agar zaroorat ho to Tally event-triggered export explore kar sakte ho
- Web dashboard widget abhi banaya nahi gaya — Phase 2 me FMS portal me integrate karna hoga
