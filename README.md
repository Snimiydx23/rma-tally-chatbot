# TallyPrime Multi-Client Chatbot — RMA Finance

## Architecture
```
[Client Tally #1] --agent--\
[Client Tally #2] --agent---> [Central API (Node.js/Express) + In-Memory/Postgres] --> [Query Engine]
[Client Tally #N] --agent--/                                                                |
                                                                                    +--------+--------+
                                                                                    |                 |
                                                                              [WhatsApp Bot]    [Web Dashboard]
```

## Overview
Web assistant and API for querying TallyPrime accounting data across multiple clients:
- Outstanding balances (Receivables & Payables)
- Day book and recent vouchers (Sales, Purchases, Payments, Receipts)
- Ledger balances and parent groups
- Client selection and auto-detection
- Webhook support for WhatsApp bot integration
- Tally agent sync endpoint (`POST /api/sync`)

## Local Development
```bash
npm install
npm run dev
```
Dev server runs on `http://0.0.0.0:3000`.

---

## Tally Sync Agent (Client Machine)

Run either the Python or Node.js agent on the machine where TallyPrime is open.

### Prerequisites in TallyPrime
1. Open TallyPrime and load your Company.
2. Press `F1` (Help) ➔ **Settings** ➔ **Connectivity**.
3. Set **TallyPrime acts as**: `Both` or `Server`.
4. Set **Enable ODBC**: `Yes`, **Port**: `9000`.

### Option A: Python Agent (`tally_agent.py`)
```bash
# Single sync test:
python tally_agent.py --api-key=sharma-key-1 --once

# Continuous background sync (every 5 minutes):
python tally_agent.py --api-key=sharma-key-1 --interval=300
```

### Option B: Node.js Agent (`tally_agent.js`)
```bash
# Single sync test:
node tally_agent.js --api-key=sharma-key-1 --once

# Continuous background sync:
node tally_agent.js --api-key=sharma-key-1 --interval=300
```

