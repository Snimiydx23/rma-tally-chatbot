"""
WhatsApp Bot (Maytapi) — Tally Chatbot Frontend
=================================================
Staff WhatsApp pe query bhejta hai (e.g. "Sharma Traders ka outstanding
kitna hai?"), ye webhook Maytapi se receive karke central API ko forward
karta hai aur jawab wapas WhatsApp pe bhejta hai.

Deploy: Flask app, Maytapi webhook URL me ye endpoint set karo.
"""

import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

MAYTAPI_PRODUCT_ID = os.environ.get("MAYTAPI_PRODUCT_ID")
MAYTAPI_PHONE_ID = os.environ.get("MAYTAPI_PHONE_ID")
MAYTAPI_TOKEN = os.environ.get("MAYTAPI_TOKEN")
CENTRAL_API_URL = os.environ.get("CENTRAL_API_URL", "https://your-central-api.example.com")

MAYTAPI_SEND_URL = f"https://api.maytapi.com/api/{MAYTAPI_PRODUCT_ID}/{MAYTAPI_PHONE_ID}/sendMessage"


def send_whatsapp(to_number: str, message: str):
    requests.post(
        MAYTAPI_SEND_URL,
        json={"to_number": to_number, "type": "text", "message": message},
        headers={"x-maytapi-key": MAYTAPI_TOKEN},
        timeout=15,
    )


@app.route("/webhook/whatsapp", methods=["POST"])
def whatsapp_webhook():
    data = request.get_json(force=True)

    # Maytapi payload structure — adjust keys as per actual webhook format
    message_data = data.get("message", {})
    text_query = message_data.get("text", "").strip()
    from_number = data.get("user", {}).get("phone", "")

    if not text_query:
        return jsonify({"status": "ignored"})

    try:
        resp = requests.post(
            f"{CENTRAL_API_URL}/api/chat",
            json={"query": text_query, "staff_phone": from_number},
            timeout=30,
        )
        resp.raise_for_status()
        answer = resp.json().get("answer", "Kuch gadbad ho gaya, dobara try karein.")
    except Exception as e:
        answer = f"Server error: {e}"

    send_whatsapp(from_number, answer)
    return jsonify({"status": "sent"})


if __name__ == "__main__":
    # Local dev ke liye. Render pe gunicorn se start hoga (Procfile/render.yaml dekhein).
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
