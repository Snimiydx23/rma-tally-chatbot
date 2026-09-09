#!/usr/bin/env node
/**
 * TallyPrime Sync Agent (Node.js)
 * --------------------------------
 * Runs on the computer with TallyPrime / Tally.ERP 9.
 * Queries Tally's local XML endpoint (http://localhost:9000)
 * and posts synchronized ledgers, vouchers, and bills to your RMA Finance API.
 * 
 * Usage:
 *   node tally_agent.js
 *   node tally_agent.js --api-key=sharma-key-1 --once
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const CONFIG = {
  tallyUrl: process.env.TALLY_URL || 'http://localhost:9000',
  centralApiUrl: process.env.CENTRAL_API_URL || 'https://ais-dev-k6j34pamhspnhekes2lttl-796467664886.asia-east1.run.app',
  apiKey: process.env.CLIENT_API_KEY || 'sharma-key-1',
  intervalSeconds: parseInt(process.env.SYNC_INTERVAL || '300', 10),
  once: process.argv.includes('--once')
};

// Command line argument parser
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--api-key=')) CONFIG.apiKey = arg.split('=')[1];
  if (arg.startsWith('--api-url=')) CONFIG.centralApiUrl = arg.split('=')[1];
  if (arg.startsWith('--tally-url=')) CONFIG.tallyUrl = arg.split('=')[1];
  if (arg.startsWith('--interval=')) CONFIG.intervalSeconds = parseInt(arg.split('=')[1], 10);
});

// XML Envelopes for Tally
const XML_LEDGERS = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>All Ledgers</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Ledgers" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

const XML_DAYBOOK = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Vouchers" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERTYPENAME, VOUCHERNUMBER, PARTYLEDGERNAME, AMOUNT, NARRATION</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

const XML_BILLS = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Bills Outstanding</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="Bills" ISMODIFY="No">
            <TYPE>Bills</TYPE>
            <FETCH>BILLDATE, BILLDUEDATE, BILLPARTY, BILLCL, BILLTYPE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

function postXml(urlStr, xmlData) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const options = {
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'text/xml;charset=utf-8',
        'Content-Length': Buffer.byteLength(xmlData)
      },
      timeout: 15000
    };

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(body));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')); });
    req.write(xmlData);
    req.end();
  });
}

function parseCleanNumber(str) {
  if (!str) return 0;
  let s = String(str).trim().replace(/,/g, '');
  let multiplier = 1;
  if (s.endsWith(' Dr') || s.endsWith('Dr')) {
    s = s.replace(/Dr/gi, '').trim();
  } else if (s.endsWith(' Cr') || s.endsWith('Cr')) {
    s = s.replace(/Cr/gi, '').trim();
    multiplier = -1;
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : Math.abs(val) * multiplier;
}

// Simple XML tag extractor
function extractTagContent(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const results = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function extractFirstTag(block, tagName, defaultValue = '') {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i').exec(block);
  return match ? match[1].trim() : defaultValue;
}

async function fetchLedgers(tallyUrl) {
  try {
    const xml = await postXml(tallyUrl, XML_LEDGERS);
    const ledgerBlocks = extractTagContent(xml, 'LEDGER').concat(extractTagContent(xml, 'TALLYOBJECT'));
    const ledgers = [];

    for (const block of ledgerBlocks) {
      const name = extractFirstTag(block, 'NAME');
      const parent = extractFirstTag(block, 'PARENT', 'Primary');
      const closing = parseCleanNumber(extractFirstTag(block, 'CLOSINGBALANCE', '0'));
      const opening = parseCleanNumber(extractFirstTag(block, 'OPENINGBALANCE', '0'));

      if (name && !name.startsWith('$$')) {
        ledgers.push({
          ledger_name: name,
          parent_group: parent,
          opening_balance: opening,
          closing_balance: closing
        });
      }
    }
    return ledgers;
  } catch (err) {
    console.error('[-] Ledgers fetch error:', err.message);
    return [];
  }
}

async function fetchVouchers(tallyUrl) {
  try {
    const xml = await postXml(tallyUrl, XML_DAYBOOK);
    const voucherBlocks = extractTagContent(xml, 'VOUCHER');
    const vouchers = [];

    for (const block of voucherBlocks) {
      let vDate = extractFirstTag(block, 'DATE');
      if (vDate.length === 8 && /^\d+$/.test(vDate)) {
        vDate = `${vDate.substring(0, 4)}-${vDate.substring(4, 6)}-${vDate.substring(6, 8)}`;
      } else if (!vDate) {
        vDate = new Date().toISOString().split('T')[0];
      }

      const vType = extractFirstTag(block, 'VOUCHERTYPENAME', 'Journal');
      const vNum = extractFirstTag(block, 'VOUCHERNUMBER', 'AUTO');
      let vParty = extractFirstTag(block, 'PARTYLEDGERNAME');
      if (!vParty) vParty = extractFirstTag(block, 'PARTYNAME', 'Cash / General');
      const vAmount = parseCleanNumber(extractFirstTag(block, 'AMOUNT', '0'));
      const vNarration = extractFirstTag(block, 'NARRATION', '');

      vouchers.push({
        voucher_date: vDate,
        voucher_type: vType,
        voucher_number: vNum,
        party_name: vParty,
        amount: Math.abs(vAmount),
        narration: vNarration
      });
    }
    return vouchers.slice(-50);
  } catch (err) {
    console.error('[-] Vouchers fetch error:', err.message);
    return [];
  }
}

async function fetchBills(tallyUrl) {
  try {
    const xml = await postXml(tallyUrl, XML_BILLS);
    const billBlocks = extractTagContent(xml, 'BILL').concat(extractTagContent(xml, 'BILLOUTSTANDING'));
    const bills = [];

    for (const block of billBlocks) {
      const party = extractFirstTag(block, 'BILLPARTY') || extractFirstTag(block, 'NAME');
      const amount = parseCleanNumber(extractFirstTag(block, 'BILLCL', '0'));
      const bType = extractFirstTag(block, 'BILLTYPE', 'Receivable');
      const due = extractFirstTag(block, 'BILLDUEDATE', '');

      if (party && amount !== 0) {
        bills.push({
          party_name: party,
          bill_type: bType.toLowerCase().includes('pay') || amount < 0 ? 'Payable' : 'Receivable',
          amount: Math.abs(amount),
          due_date: due
        });
      }
    }
    return bills;
  } catch (err) {
    console.error('[-] Bills fetch error:', err.message);
    return [];
  }
}

function postToCentral(centralUrl, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(`${centralUrl.replace(/\/$/, '')}/api/sync`);
    const dataStr = JSON.stringify(payload);

    const options = {
      method: 'POST',
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(dataStr)
      },
      timeout: 20000
    };

    const client = target.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Sync upload timed out')); });
    req.write(dataStr);
    req.end();
  });
}

async function runSync() {
  const timestamp = new Date().toLocaleTimeString('en-IN');
  console.log(`\n[${timestamp}] Connecting to Tally at ${CONFIG.tallyUrl}...`);

  try {
    const [ledgers, vouchers, outstanding] = await Promise.all([
      fetchLedgers(CONFIG.tallyUrl),
      fetchVouchers(CONFIG.tallyUrl),
      fetchBills(CONFIG.tallyUrl)
    ]);

    console.log(`[+] Tally extracted: ${ledgers.length} Ledgers, ${vouchers.length} Vouchers, ${outstanding.length} Outstanding bills.`);

    if (!ledgers.length && !vouchers.length && !outstanding.length) {
      console.log('[!] Warning: 0 records found. Make sure TallyPrime is open with an active company on port 9000.');
      return;
    }

    console.log(`[+] Sending data to RMA Server (${CONFIG.centralApiUrl})...`);
    const result = await postToCentral(CONFIG.centralApiUrl, CONFIG.apiKey, { ledgers, vouchers, outstanding });

    if (result.status === 200 || result.status === 201) {
      console.log(`[✓] Sync SUCCESS! Response:`, result.body);
    } else {
      console.error(`[-] Server rejected sync (${result.status}):`, result.body);
    }
  } catch (err) {
    console.error('[-] Sync Failed:', err.message);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('      RMA Finance — TallyPrime Live Sync Agent (Node.js)');
  console.log('='.repeat(60));
  console.log(`• Tally URL    : ${CONFIG.tallyUrl}`);
  console.log(`• Central API  : ${CONFIG.centralApiUrl}`);
  console.log(`• API Key      : ${CONFIG.apiKey.slice(0, 4)}***`);
  console.log(`• Interval     : ${CONFIG.intervalSeconds}s`);
  console.log('='.repeat(60));

  if (CONFIG.once) {
    await runSync();
    process.exit(0);
  }

  await runSync();
  setInterval(runSync, CONFIG.intervalSeconds * 1000);
  console.log(`[*] Sync agent scheduled every ${CONFIG.intervalSeconds}s. Press Ctrl+C to stop.`);
}

main();
