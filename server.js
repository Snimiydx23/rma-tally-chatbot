import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory Database Store
const db = {
  clients: [
    { client_id: 1, company_name: "Sharma Traders", api_key: "sharma-key-1", status: "active" },
    { client_id: 2, company_name: "Devi Iron & Steel", api_key: "devi-key-2", status: "active" },
    { client_id: 3, company_name: "Agarwal Enterprises", api_key: "agarwal-key-3", status: "active" },
    { client_id: 4, company_name: "Rajasthan Hardware", api_key: "rajasthan-key-4", status: "active" }
  ],
  ledgers: [
    // Client 1 - Sharma Traders
    { client_id: 1, ledger_name: "Sharma Traders", parent_group: "Sundry Debtors", opening_balance: 50000, closing_balance: 145000, last_updated: new Date().toISOString() },
    { client_id: 1, ledger_name: "HDFC Current Account", parent_group: "Bank Accounts", opening_balance: 200000, closing_balance: 485000, last_updated: new Date().toISOString() },
    { client_id: 1, ledger_name: "Sales Account (GST 18%)", parent_group: "Sales Accounts", opening_balance: 0, closing_balance: 920000, last_updated: new Date().toISOString() },
    { client_id: 1, ledger_name: "Gupta Supplies & Co", parent_group: "Sundry Creditors", opening_balance: 30000, closing_balance: 45000, last_updated: new Date().toISOString() },
    { client_id: 1, ledger_name: "Output CGST / SGST", parent_group: "Duties & Taxes", opening_balance: 10000, closing_balance: 38200, last_updated: new Date().toISOString() },

    // Client 2 - Devi Iron & Steel
    { client_id: 2, ledger_name: "Devi Iron & Steel", parent_group: "Sundry Debtors", opening_balance: 120000, closing_balance: 320000, last_updated: new Date().toISOString() },
    { client_id: 2, ledger_name: "SBI Current Account", parent_group: "Bank Accounts", opening_balance: 150000, closing_balance: 275000, last_updated: new Date().toISOString() },
    { client_id: 2, ledger_name: "Tata Steel Ltd", parent_group: "Sundry Creditors", opening_balance: 90000, closing_balance: 180000, last_updated: new Date().toISOString() },
    { client_id: 2, ledger_name: "Steel Billet Purchases", parent_group: "Purchase Accounts", opening_balance: 0, closing_balance: 620000, last_updated: new Date().toISOString() },

    // Client 3 - Agarwal Enterprises
    { client_id: 3, ledger_name: "Agarwal Enterprises", parent_group: "Sundry Creditors", opening_balance: 40000, closing_balance: 80000, last_updated: new Date().toISOString() },
    { client_id: 3, ledger_name: "ICICI Bank", parent_group: "Bank Accounts", opening_balance: 300000, closing_balance: 520000, last_updated: new Date().toISOString() }
  ],
  outstandings: [
    // Client 1
    { client_id: 1, party_name: "Sharma Traders", bill_type: "Receivable", amount: 145000, due_date: "2026-09-15" },
    { client_id: 1, party_name: "Gupta Supplies & Co", bill_type: "Payable", amount: 45000, due_date: "2026-09-20" },

    // Client 2
    { client_id: 2, party_name: "Devi Iron & Steel", bill_type: "Receivable", amount: 320000, due_date: "2026-09-10" },
    { client_id: 2, party_name: "Tata Steel Ltd", bill_type: "Payable", amount: 180000, due_date: "2026-09-25" },

    // Client 3
    { client_id: 3, party_name: "Agarwal Enterprises", bill_type: "Payable", amount: 80000, due_date: "2026-09-18" },
    { client_id: 3, party_name: "National Distributors", bill_type: "Receivable", amount: 65000, due_date: "2026-09-22" }
  ],
  vouchers: [
    // Client 1 Day book
    { client_id: 1, voucher_date: "2026-09-06", voucher_type: "Sales", voucher_number: "INV-2026-104", party_name: "Sharma Traders", amount: 45000, narration: "Goods supplied as per PO #104" },
    { client_id: 1, voucher_date: "2026-09-05", voucher_type: "Receipt", voucher_number: "REC-2026-089", party_name: "Sharma Traders", amount: 20000, narration: "Cheque received HDFC 449201" },
    { client_id: 1, voucher_date: "2026-09-04", voucher_type: "Payment", voucher_number: "PAY-2026-042", party_name: "Gupta Supplies & Co", amount: 15000, narration: "NEFT vendor payment" },
    { client_id: 1, voucher_date: "2026-09-02", voucher_type: "Sales", voucher_number: "INV-2026-103", party_name: "Sharma Traders", amount: 70000, narration: "Standard dispatch" },

    // Client 2 Day book
    { client_id: 2, voucher_date: "2026-09-06", voucher_type: "Sales", voucher_number: "SAL-991", party_name: "Devi Iron & Steel", amount: 85000, narration: "TMT bars dispatch batch #3" },
    { client_id: 2, voucher_date: "2026-09-05", voucher_type: "Sales", voucher_number: "SAL-984", party_name: "Devi Iron & Steel", amount: 110000, narration: "Structural steel delivery" },
    { client_id: 2, voucher_date: "2026-09-03", voucher_type: "Payment", voucher_number: "PAY-812", party_name: "Tata Steel Ltd", amount: 50000, narration: "Advance payment for raw material" },

    // Client 3 Day book
    { client_id: 3, voucher_date: "2026-09-06", voucher_type: "Purchase", voucher_number: "PUR-102", party_name: "Agarwal Enterprises", amount: 50000, narration: "Office stationery bulk supply" }
  ],
  sync_logs: [
    { client_id: 1, status: "success", records_synced: 12, timestamp: new Date().toISOString() },
    { client_id: 2, status: "success", records_synced: 15, timestamp: new Date().toISOString() }
  ],
  staff_access: [
    { staff_phone: "919876543210", client_id: 1, role: "viewer" }
  ]
};

// Helper: Resolve client from text or list
function resolveClient(queryText) {
  const q = (queryText || '').toLowerCase();
  for (const client of db.clients) {
    const words = client.company_name.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && q.includes(w)) {
        return { client_id: client.client_id, company_name: client.company_name };
      }
    }
  }
  return { client_id: null, company_name: null };
}

// Format numbers in Indian Rupee format (e.g., 1,45,000)
function formatINR(num) {
  if (num === null || num === undefined) return "0";
  return Number(num).toLocaleString('en-IN');
}

// Optional Gemini API integration for natural language accounting questions
async function callGeminiIfAvailable(query, client, contextData) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `You are RMA Finance's Tally Assistant AI bot. 
The user is asking a financial query in Hinglish or English regarding company "${client.company_name}".
Here is the live synchronized data from TallyPrime:
${JSON.stringify(contextData, null, 2)}

User Question: "${query}"

Respond concisely, accurately, and professionally in conversational Hinglish/English.
Highlight key numbers with rupee symbols (₹). Be direct without unnecessary fluff.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (err) {
    console.warn("Gemini call error:", err.message);
    return null;
  }
}

// Core Query Engine
async function handleQuery(query, clientId) {
  const client = db.clients.find(c => c.client_id === clientId);
  if (!client) {
    return "Client nahi mila. Kripya valid client select karein.";
  }

  const q = query.toLowerCase();
  const clientOutstandings = db.outstandings.filter(o => o.client_id === clientId);
  const clientVouchers = db.vouchers.filter(v => v.client_id === clientId);
  const clientLedgers = db.ledgers.filter(l => l.client_id === clientId);

  // Intent 1: Outstanding / Receivables / Payables / Baaki
  if (q.includes("outstanding") || q.includes("baaki") || q.includes("due") || q.includes("receivable") || q.includes("payable") || q.includes("pending")) {
    const receivables = clientOutstandings.filter(o => o.bill_type.toLowerCase() === "receivable");
    const payables = clientOutstandings.filter(o => o.bill_type.toLowerCase() === "payable");

    const totalRec = receivables.reduce((sum, o) => sum + o.amount, 0);
    const totalPay = payables.reduce((sum, o) => sum + o.amount, 0);

    let res = `📊 *${client.company_name} — Outstanding Summary*\n\n`;
    res += `• Total Receivable (Lene hain): ₹${formatINR(totalRec)}\n`;
    res += `• Total Payable (Dene hain): ₹${formatINR(totalPay)}\n\n`;

    if (clientOutstandings.length > 0) {
      res += `*Bill Breakdown:*\n`;
      clientOutstandings.forEach((o, i) => {
        res += `${i + 1}. ${o.party_name}: ₹${formatINR(o.amount)} (${o.bill_type}, Due: ${o.due_date || 'Immediate'})\n`;
      });
    } else {
      res += `Koi outstanding bill pending nahi hai.`;
    }
    return res;
  }

  // Intent 2: Day Book / Vouchers / Transactions / Sales / Receipts
  if (q.includes("day book") || q.includes("daybook") || q.includes("voucher") || q.includes("transaction") || q.includes("aaj ka") || q.includes("entries") || q.includes("entry") || q.includes("sales") || q.includes("purchase")) {
    let res = `📖 *${client.company_name} — Day Book & Recent Vouchers*\n\n`;
    if (clientVouchers.length === 0) {
      res += `Abhi tak koi recent vouchers sync nahi hue hain.`;
    } else {
      clientVouchers.forEach((v, i) => {
        res += `${i + 1}. [${v.voucher_date}] ${v.voucher_type} #${v.voucher_number}\n`;
        res += `   Party: ${v.party_name} | Amount: ₹${formatINR(v.amount)}\n`;
        if (v.narration) res += `   Narration: ${v.narration}\n`;
      });
    }
    return res;
  }

  // Intent 3: Ledgers / Khata / Balances / Bank
  if (q.includes("ledger") || q.includes("khata") || q.includes("balance") || q.includes("closing") || q.includes("bank") || q.includes("account")) {
    let res = `📑 *${client.company_name} — Ledger Balances*\n\n`;
    if (clientLedgers.length === 0) {
      res += `Is client ke ledgers available nahi hain.`;
    } else {
      clientLedgers.forEach((l, i) => {
        res += `${i + 1}. ${l.ledger_name} (${l.parent_group})\n`;
        res += `   Closing Balance: ₹${formatINR(l.closing_balance)} (Opening: ₹${formatINR(l.opening_balance)})\n`;
      });
    }
    return res;
  }

  // Intent 4: Sync status / Health
  if (q.includes("sync") || q.includes("status") || q.includes("last updated") || q.includes("agent")) {
    const logs = db.sync_logs.filter(l => l.client_id === clientId);
    const lastLog = logs[logs.length - 1];
    return `✅ *Tally Agent Sync Status — ${client.company_name}*\n\n` +
           `• Status: ${client.status.toUpperCase()}\n` +
           `• Last Sync: ${lastLog ? new Date(lastLog.timestamp).toLocaleString('en-IN') : 'Recently'}\n` +
           `• Records Synced: ${lastLog ? lastLog.records_synced : 0}\n` +
           `• Tally Agent: Running (Port 9000 connected)`;
  }

  // Fallback with Gemini if configured
  const aiAnswer = await callGeminiIfAvailable(query, client, {
    client: client.company_name,
    ledgers: clientLedgers,
    outstandings: clientOutstandings,
    recentVouchers: clientVouchers
  });
  if (aiAnswer) return aiAnswer;

  // Default Overview
  const totalRec = clientOutstandings.filter(o => o.bill_type.toLowerCase() === "receivable").reduce((s, o) => s + o.amount, 0);
  const totalPay = clientOutstandings.filter(o => o.bill_type.toLowerCase() === "payable").reduce((s, o) => s + o.amount, 0);

  return `📊 *${client.company_name} — Tally Summary*\n\n` +
         `• Outstanding Receivable: ₹${formatINR(totalRec)}\n` +
         `• Outstanding Payable: ₹${formatINR(totalPay)}\n` +
         `• Active Ledgers: ${clientLedgers.length}\n` +
         `• Recent Vouchers: ${clientVouchers.length}\n\n` +
         `Aap pooch sakte hain:\n` +
         `- "Outstanding kitna hai?"\n` +
         `- "Day book dikhao"\n` +
         `- "Ledger balance kya hai?"\n` +
         `- "Sync status check karo"`;
}

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/clients
app.get("/api/clients", (req, res) => {
  const clientList = db.clients.map(c => ({
    client_id: c.client_id,
    company_name: c.company_name,
    status: c.status
  }));
  res.json(clientList);
});

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  const { query, staff_phone } = req.body || {};
  let clientId = req.body?.client_id;
  let clientName = null;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: "Query is required." });
  }

  // If no clientId provided, resolve from query
  if (!clientId) {
    const resolved = resolveClient(query);
    clientId = resolved.client_id;
    clientName = resolved.company_name;
  } else {
    const match = db.clients.find(c => c.client_id === Number(clientId));
    if (match) clientName = match.company_name;
  }

  // If still not resolved
  if (!clientId) {
    const activeClients = db.clients.filter(c => c.status === "active").slice(0, 10);
    const names = activeClients.map(c => c.company_name).join(", ");
    return res.json({
      answer: `Kis client ka data chahiye? Query me company ka naam bhi likhein ya upar dropdown se select karein.\nKuch clients: ${names}...`,
      client_id: null,
      client_name: null
    });
  }

  // Staff access control check (if phone provided)
  if (staff_phone) {
    const hasAccess = db.staff_access.some(
      a => a.staff_phone === staff_phone && a.client_id === Number(clientId)
    );
    // Allow by default if no restrictive mappings exist, else enforce
    if (db.staff_access.length > 0 && !hasAccess) {
      return res.json({
        answer: "Aapko is client ka data access karne ki permission nahi hai.",
        client_id: clientId,
        client_name: clientName
      });
    }
  }

  const answer = await handleQuery(query, Number(clientId));
  return res.json({
    answer,
    client_id: Number(clientId),
    client_name: clientName
  });
});

// POST /api/sync
app.post("/api/sync", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid API key in Authorization header." });
  }

  const apiKey = authHeader.split(" ")[1];
  const client = db.clients.find(c => c.api_key === apiKey && c.status === "active");
  if (!client) {
    return res.status(403).json({ error: "Invalid API key." });
  }

  const payload = req.body || {};
  let count = 0;
  const cid = client.client_id;

  if (Array.isArray(payload.ledgers)) {
    for (const l of payload.ledgers) {
      const existing = db.ledgers.find(item => item.client_id === cid && item.ledger_name === l.ledger_name);
      if (existing) {
        existing.closing_balance = l.closing_balance ?? existing.closing_balance;
        existing.opening_balance = l.opening_balance ?? existing.opening_balance;
        existing.parent_group = l.parent_group ?? existing.parent_group;
        existing.last_updated = new Date().toISOString();
      } else {
        db.ledgers.push({ client_id: cid, ...l, last_updated: new Date().toISOString() });
      }
      count++;
    }
  }

  if (Array.isArray(payload.vouchers)) {
    for (const v of payload.vouchers) {
      db.vouchers.unshift({ client_id: cid, ...v });
      count++;
    }
  }

  if (Array.isArray(payload.outstanding)) {
    for (const o of payload.outstanding) {
      db.outstandings.push({ client_id: cid, ...o });
      count++;
    }
  }

  db.sync_logs.push({
    client_id: cid,
    status: "success",
    records_synced: count,
    timestamp: new Date().toISOString()
  });

  res.json({ status: "ok", records_synced: count });
});

// POST /webhook/whatsapp
app.post("/webhook/whatsapp", async (req, res) => {
  const data = req.body || {};
  const messageData = data.message || {};
  const textQuery = (messageData.text || "").trim();
  const fromNumber = data.user?.phone || "";

  if (!textQuery) {
    return res.json({ status: "ignored" });
  }

  try {
    const resolved = resolveClient(textQuery);
    const answer = await handleQuery(textQuery, resolved.client_id || 1);
    res.json({ status: "sent", answer, to: fromNumber });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Static Assets
app.use(express.static(__dirname));

// Fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RMA Finance Tally Chatbot running on http://0.0.0.0:${PORT}`);
});
