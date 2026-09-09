#!/usr/bin/env python3
"""
TallyPrime Sync Agent (Python)
------------------------------
This script runs on the machine where TallyPrime / Tally.ERP 9 is installed.
It connects to Tally's local XML/ODBC interface (default: http://localhost:9000),
extracts:
  1. Ledger Master & Balances (Closing / Opening / Group)
  2. Day Book Vouchers (Sales, Purchase, Payment, Receipt, etc.)
  3. Bills Outstanding (Receivables & Payables)
and securely synchronizes the data to your RMA Finance Central Chatbot API.

Requirements:
  pip install requests
(or run with standard urllib if requests is not installed)
"""

import sys
import time
import json
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_REQUESTS = False

# Default Configuration
DEFAULT_TALLY_URL = "http://localhost:9000"
DEFAULT_CENTRAL_API_URL = "https://ais-dev-k6j34pamhspnhekes2lttl-796467664886.asia-east1.run.app"
DEFAULT_API_KEY = "sharma-key-1"  # Replace with client-specific API key from your admin dashboard
SYNC_INTERVAL_SECONDS = 300       # 5 minutes default

# XML Request Templates for TallyPrime
XML_REQUEST_LEDGERS = """<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
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
          <COLLECTION NAME="ChatbotLedgerCollection" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <FETCH>NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

XML_REQUEST_DAYBOOK = """<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
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
          <COLLECTION NAME="ChatbotVoucherCollection" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>DATE, VOUCHERTYPENAME, VOUCHERNUMBER, PARTYLEDGERNAME, AMOUNT, NARRATION</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""

XML_REQUEST_BILLS = """<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
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
          <COLLECTION NAME="ChatbotBillsCollection" ISMODIFY="No">
            <TYPE>Bills</TYPE>
            <FETCH>BILLDATE, BILLDUEDATE, BILLPARTY, BILLCL, BILLTYPE</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>"""


def query_tally(tally_url: str, xml_payload: str) -> str:
    """Send XML request to Tally local port."""
    if HAS_REQUESTS:
        response = requests.post(
            tally_url,
            data=xml_payload.encode("utf-8"),
            headers={"Content-Type": "text/xml;charset=utf-8"},
            timeout=15
        )
        return response.text
    else:
        req = urllib.request.Request(
            tally_url,
            data=xml_payload.encode("utf-8"),
            headers={"Content-Type": "text/xml;charset=utf-8"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")


def parse_clean_number(val_str) -> float:
    """Safely convert Tally amount string to float."""
    if not val_str:
        return 0.0
    s = str(val_str).strip().replace(",", "")
    # Tally sometimes appends 'Dr' or 'Cr' or uses negative signs
    multiplier = 1.0
    if s.endswith(" Dr") or s.endswith("Dr"):
        s = s.replace("Dr", "").strip()
    elif s.endswith(" Cr") or s.endswith("Cr"):
        s = s.replace("Cr", "").strip()
        multiplier = -1.0
    try:
        return abs(float(s)) * multiplier
    except ValueError:
        return 0.0


def fetch_tally_ledgers(tally_url: str):
    """Fetch ledgers list from Tally."""
    try:
        raw_xml = query_tally(tally_url, XML_REQUEST_LEDGERS)
        root = ET.fromstring(raw_xml)
        ledgers = []

        for elem in root.iter():
            tag = elem.tag.upper()
            if tag in ("LEDGER", "TALLYOBJECT") and (elem.find("NAME") is not None or elem.get("NAME")):
                name = elem.get("NAME") or ""
                name_elem = elem.find("NAME")
                if name_elem is not None and name_elem.text:
                    name = name_elem.text.strip()

                parent_elem = elem.find("PARENT")
                parent = parent_elem.text.strip() if (parent_elem is not None and parent_elem.text) else "Primary"

                closing_elem = elem.find("CLOSINGBALANCE")
                closing = parse_clean_number(closing_elem.text if closing_elem is not None else 0)

                opening_elem = elem.find("OPENINGBALANCE")
                opening = parse_clean_number(opening_elem.text if opening_elem is not None else 0)

                if name and not name.startswith("$$"):
                    ledgers.append({
                        "ledger_name": name,
                        "parent_group": parent,
                        "opening_balance": opening,
                        "closing_balance": closing
                    })

        return ledgers
    except Exception as e:
        print(f"[-] Warning parsing ledgers: {e}")
        return []


def fetch_tally_vouchers(tally_url: str):
    """Fetch recent vouchers from Tally Day Book."""
    try:
        raw_xml = query_tally(tally_url, XML_REQUEST_DAYBOOK)
        root = ET.fromstring(raw_xml)
        vouchers = []

        for v in root.iter():
            tag = v.tag.upper()
            if tag == "VOUCHER":
                v_date = v.findtext("DATE", default="")
                # Tally format is often YYYYMMDD
                if len(v_date) == 8 and v_date.isdigit():
                    v_date = f"{v_date[0:4]}-{v_date[4:6]}-{v_date[6:8]}"
                elif not v_date:
                    v_date = datetime.now().strftime("%Y-%m-%d")

                v_type = v.findtext("VOUCHERTYPENAME", default="Journal")
                v_num = v.findtext("VOUCHERNUMBER", default="AUTO")
                v_party = v.findtext("PARTYLEDGERNAME", default="")
                if not v_party:
                    v_party = v.findtext("PARTYNAME", default="Cash / General")

                v_amount = parse_clean_number(v.findtext("AMOUNT", default="0"))
                v_narration = v.findtext("NARRATION", default="")

                if v_num:
                    vouchers.append({
                        "voucher_date": v_date,
                        "voucher_type": v_type,
                        "voucher_number": v_num,
                        "party_name": v_party,
                        "amount": abs(v_amount),
                        "narration": v_narration
                    })

        # Return latest 50 vouchers
        return vouchers[-50:]
    except Exception as e:
        print(f"[-] Warning parsing vouchers: {e}")
        return []


def fetch_tally_outstandings(tally_url: str):
    """Fetch bills receivable and payable."""
    try:
        raw_xml = query_tally(tally_url, XML_REQUEST_BILLS)
        root = ET.fromstring(raw_xml)
        bills = []

        for b in root.iter():
            tag = b.tag.upper()
            if tag in ("BILL", "BILLOUTSTANDING"):
                party = b.findtext("BILLPARTY", default="") or b.findtext("NAME", default="")
                amount = parse_clean_number(b.findtext("BILLCL", default="0"))
                bill_type = b.findtext("BILLTYPE", default="Receivable")
                due_date = b.findtext("BILLDUEDATE", default="")

                if party and amount != 0:
                    bills.append({
                        "party_name": party,
                        "bill_type": "Payable" if "pay" in bill_type.lower() or amount < 0 else "Receivable",
                        "amount": abs(amount),
                        "due_date": due_date
                    })

        return bills
    except Exception as e:
        print(f"[-] Warning parsing outstanding bills: {e}")
        return []


def push_to_central_api(api_url: str, api_key: str, payload: dict):
    """Push extracted Tally data to RMA Finance Chatbot API."""
    sync_url = f"{api_url.rstrip('/')}/api/sync"
    body_json = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    if HAS_REQUESTS:
        resp = requests.post(sync_url, data=body_json, headers=headers, timeout=20)
        return resp.status_code, resp.text
    else:
        req = urllib.request.Request(sync_url, data=body_json, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8")


def sync_once(tally_url: str, api_url: str, api_key: str):
    """Perform a single sync cycle."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{timestamp}] Connecting to TallyPrime at {tally_url}...")

    try:
        ledgers = fetch_tally_ledgers(tally_url)
        vouchers = fetch_tally_vouchers(tally_url)
        outstandings = fetch_tally_outstandings(tally_url)

        print(f"[+] Extracted from Tally: {len(ledgers)} Ledgers, {len(vouchers)} Vouchers, {len(outstandings)} Outstanding records.")

        if not ledgers and not vouchers and not outstandings:
            print("[!] Warning: No records found. Make sure:")
            print("    1. TallyPrime is open with a Company loaded.")
            print("    2. F1: Help -> Settings -> Connectivity -> Port 9000 is Enabled.")
            return False

        payload = {
            "ledgers": ledgers,
            "vouchers": vouchers,
            "outstanding": outstandings
        }

        print(f"[+] Uploading to RMA Central API ({api_url})...")
        status_code, resp_text = push_to_central_api(api_url, api_key, payload)

        if status_code in (200, 201):
            print(f"[✓] Sync SUCCESS! Server response: {resp_text}")
            return True
        else:
            print(f"[-] Sync failed with HTTP status {status_code}: {resp_text}")
            return False

    except Exception as e:
        print(f"[-] Connection or Sync Error: {e}")
        print("    Check if Tally is running on port 9000 and internet is active.")
        return False


def main():
    parser = argparse.ArgumentParser(description="TallyPrime to RMA Chatbot Sync Agent")
    parser.add_argument("--tally-url", default=DEFAULT_TALLY_URL, help=f"Tally XML server URL (default: {DEFAULT_TALLY_URL})")
    parser.add_argument("--api-url", default=DEFAULT_CENTRAL_API_URL, help=f"RMA Central API base URL (default: {DEFAULT_CENTRAL_API_URL})")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="Client API Key (from RMA Admin dashboard)")
    parser.add_argument("--interval", type=int, default=SYNC_INTERVAL_SECONDS, help="Auto sync interval in seconds (default: 300)")
    parser.add_argument("--once", action="store_true", help="Run sync only once and exit")

    args = parser.parse_args()

    print("=" * 65)
    print("      RMA Finance — TallyPrime Live Sync Agent (Python)")
    print("=" * 65)
    print(f"• Tally Address  : {args.tally_url}")
    print(f"• Central Server : {args.api_url}")
    print(f"• Client Key     : {args.api_key[:4]}***")
    print(f"• Interval       : {args.interval}s {'(Single run mode)' if args.once else ''}")
    print("=" * 65)

    if args.once:
        sync_once(args.tally_url, args.api_url, args.api_key)
        sys.exit(0)

    # Continuous sync loop
    while True:
        sync_once(args.tally_url, args.api_url, args.api_key)
        print(f"[*] Sleeping for {args.interval} seconds... (Press Ctrl+C to stop)")
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\n[!] Sync agent stopped by user.")
            break


if __name__ == "__main__":
    main()
