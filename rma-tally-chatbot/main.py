import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from central_api.database import get_db, Client, Ledger, Voucher, Outstanding, SyncLog
from query_engine.query_engine import handle_query, resolve_client
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(title="Tally Multi-Client Chatbot API")

# Web dashboard alag domain pe hosted hoga (Render static site), isliye CORS
# enable karna zaroori hai. ALLOWED_ORIGINS env var me apne dashboard ka
# actual URL daalo (comma-separated agar multiple).
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str
    client_id: int | None = None   # optional — agar diya hai to direct use hoga
    staff_phone: str | None = None


def authenticate_client(authorization: str, db: Session) -> Client:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing API key")
    api_key = authorization.split(" ", 1)[1]
    client = db.query(Client).filter(Client.api_key == api_key, Client.status == "active").first()
    if not client:
        raise HTTPException(403, "Invalid API key")
    return client


@app.post("/api/sync")
def sync_data(payload: dict, authorization: str = Header(None), db: Session = Depends(get_db)):
    """Client-side Tally agent yahan data push karta hai."""
    client = authenticate_client(authorization, db)
    cid = client.client_id
    count = 0

    for l in payload.get("ledgers", []):
        existing = db.query(Ledger).filter(
            Ledger.client_id == cid, Ledger.ledger_name == l["ledger_name"]
        ).first()
        if existing:
            existing.closing_balance = l["closing_balance"]
            existing.opening_balance = l["opening_balance"]
            existing.parent_group = l["parent_group"]
            existing.last_updated = datetime.utcnow()
        else:
            db.add(Ledger(client_id=cid, **l))
        count += 1

    for v in payload.get("vouchers", []):
        db.add(Voucher(client_id=cid, **{k: v[k] for k in v if k != "voucher_date"},
                        voucher_date=_parse_date(v.get("voucher_date"))))
        count += 1

    for o in payload.get("outstanding", []):
        db.add(Outstanding(client_id=cid, party_name=o.get("party_name"),
                            bill_type=o.get("bill_type"), amount=o.get("amount"),
                            due_date=_parse_date(o.get("due_date"))))
        count += 1

    db.add(SyncLog(client_id=cid, status="success", records_synced=count))
    db.commit()
    return {"status": "ok", "records_synced": count}


@app.post("/api/chat")
def chat(req: ChatRequest, authorization: str = Header(None), db: Session = Depends(get_db)):
    """WhatsApp/Web se query yahan aati hai. Client_id resolve karke query engine ko bhejta hai."""
    cid = req.client_id
    client_name = None

    if not cid:
        cid, client_name = resolve_client(db, req.query)

    if not cid:
        clients = db.execute(text("SELECT company_name FROM clients WHERE status='active' LIMIT 10")).fetchall()
        names = ", ".join(c[0] for c in clients)
        return {"answer": f"Kis client ka data chahiye? Query me company ka naam bhi likhein. "
                           f"Kuch clients: {names}..."}

    # Access control check (agar staff_phone diya hai)
    if req.staff_phone:
        allowed = db.execute(
            text("SELECT 1 FROM staff_access WHERE staff_phone=:p AND client_id=:c"),
            {"p": req.staff_phone, "c": cid},
        ).fetchone()
        if not allowed:
            return {"answer": "Aapko is client ka data access karne ki permission nahi hai."}

    answer = handle_query(db, req.query, cid)
    return {"answer": answer, "client_id": cid, "client_name": client_name}


@app.get("/api/clients")
def list_clients(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT client_id, company_name, status FROM clients")).fetchall()
    return [{"client_id": r[0], "company_name": r[1], "status": r[2]} for r in rows]


def _parse_date(val):
    if not val:
        return None
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None
