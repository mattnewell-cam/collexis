from __future__ import annotations

import asyncio
from html import escape
from pathlib import Path

from playwright.async_api import async_playwright

ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / "sample_data"

COMPANY = {
    "name": "Northgate Property Services Ltd",
    "short_name": "Northgate Property Services",
    "address": ["41 Armitage Street", "Bristol BS3 5NE"],
    "accounts_email": "accounts@northgateps.co.uk",
    "phone": "0117 496 2184",
}

BUNDLES = [
    {
        "slug": "sophie_wilkes",
        "invoice": {
            "file_name": "invoice-sophie-wilkes.pdf",
            "accent": "#0f766e",
            "invoice_number": "INV-2026-0814",
            "issue_date": "02 March 2026",
            "due_date": "09 March 2026",
            "reference": "Bathroom leak repair and making good",
            "customer": {
                "name": "Sophie Wilkes",
                "address": ["88 St George Road", "Bristol BS1 5UU"],
            },
            "note": "Final invoice covering leak tracing, shower valve replacement, silicone reseal, ceiling patch repair, and return visit to confirm the bathroom was watertight.",
            "footer": "Please quote the invoice number when paying by bank transfer. Thank you for the quick access arrangements during the works.",
            "rows": [
                ["Leak trace and first attendance", "1", "125.00", "125.00"],
                ["Shower valve and fittings", "1", "146.00", "146.00"],
                ["Repair labour and sealing works", "3 hrs", "72.00", "216.00"],
                ["Ceiling patch and final check", "1", "84.00", "84.00"],
            ],
            "subtotal": "571.00",
            "vat": "114.20",
            "total": "685.20",
        },
        "assets": [
            {
                "type": "whatsapp",
                "file_name": "whatsapp-2026-03-04.png",
                "contact": "Sophie Wilkes",
                "status": "online",
                "day_label": "Wednesday 4 March 2026",
                "accent": "#dcf8c6",
                "messages": [
                    {
                        "side": "right",
                        "time": "08:54",
                        "text": "Morning Sophie, just checking you received invoice INV-2026-0814 for the bathroom leak repair.",
                    },
                    {
                        "side": "left",
                        "time": "09:01",
                        "text": "Yes, thank you. I have it and will get it paid on Friday once my house account transfer lands.",
                    },
                    {
                        "side": "right",
                        "time": "09:03",
                        "text": "Perfect, thanks. Please message once it has gone through so we can close the job down.",
                    },
                    {"side": "left", "time": "09:05", "text": "Will do."},
                ],
            },
            {
                "type": "sms",
                "file_name": "sms-2026-03-09.png",
                "contact": "Sophie Wilkes",
                "day_label": "Monday 9 March 2026",
                "messages": [
                    {
                        "side": "right",
                        "time": "10:11",
                        "text": "Hi Sophie, just checking whether payment for INV-2026-0814 has been sent today as promised.",
                    },
                    {
                        "side": "left",
                        "time": "10:16",
                        "text": "Yes, it has just gone through from my bank app. It should reach you this afternoon.",
                    },
                ],
            },
            {
                "type": "email",
                "file_name": "email-2026-03-13.png",
                "app_label": "Mail",
                "account": "sophie.wilkes@gmail.com",
                "subject": "Re: payment sent for INV-2026-0814",
                "from": "Sophie Wilkes <sophie.wilkes@gmail.com>",
                "to": f"Accounts <{COMPANY['accounts_email']}>",
                "sent": "Fri 13 Mar 2026 14:07",
                "body": [
                    "Hi,",
                    "",
                    "Just confirming the transfer for INV-2026-0814 left my account earlier this week and should already be showing with you.",
                    "",
                    "If you need the bank reference I can forward it across.",
                    "",
                    "Regards,",
                    "Sophie",
                ],
            },
        ],
    },
    {
        "slug": "declan_pryce",
        "invoice": {
            "file_name": "invoice-declan-pryce.pdf",
            "accent": "#991b1b",
            "invoice_number": "INV-2026-0899",
            "issue_date": "01 March 2026",
            "due_date": "08 March 2026",
            "reference": "Kitchen ceiling repair after repeat leak damage",
            "customer": {
                "name": "Declan Pryce",
                "address": ["27 Calder Street", "Leeds LS6 2RP"],
            },
            "note": "Invoice for repeat attendance, ceiling removal and reboard, stain block treatment, plaster skim, extractor isolation, and final redecorating prep after a tenant leak.",
            "footer": "Payment terms are 7 days from issue. Continued non-payment may result in the account being escalated to formal recovery.",
            "rows": [
                ["Initial inspection and moisture testing", "1", "145.00", "145.00"],
                ["Ceiling strip-out and disposal", "1", "188.00", "188.00"],
                ["New plasterboard, fixings, and stain block", "1", "236.00", "236.00"],
                ["Plaster skim and drying return visit", "5 hrs", "78.00", "390.00"],
                ["Making good and final attendance", "1", "124.00", "124.00"],
            ],
            "subtotal": "1083.00",
            "vat": "216.60",
            "total": "1299.60",
        },
        "assets": [
            {
                "type": "whatsapp",
                "file_name": "whatsapp-2026-03-05.png",
                "contact": "Declan Pryce",
                "status": "last seen today at 09:41",
                "day_label": "Thursday 5 March 2026",
                "accent": "#fce7f3",
                "messages": [
                    {
                        "side": "right",
                        "time": "09:14",
                        "text": "Morning Declan, just checking you received invoice INV-2026-0899 issued on 1 March for the kitchen ceiling works.",
                    },
                    {
                        "side": "left",
                        "time": "09:18",
                        "text": "I received it. No need to keep nudging me four days after sending it.",
                    },
                    {
                        "side": "right",
                        "time": "09:21",
                        "text": "Understood. It falls due on 8 March, so we are just making sure there are no issues.",
                    },
                    {
                        "side": "left",
                        "time": "09:24",
                        "text": "The issue is your office sends paperwork before I have even had breakfast. I will deal with it when I have a minute.",
                    },
                ],
            },
            {
                "type": "sms",
                "file_name": "sms-2026-03-10.png",
                "contact": "Declan Pryce",
                "day_label": "Tuesday 10 March 2026",
                "messages": [
                    {
                        "side": "right",
                        "time": "08:52",
                        "text": "Hi Declan, INV-2026-0899 is now overdue. Please confirm today when the GBP 1,299.60 balance will be paid.",
                    },
                    {
                        "side": "left",
                        "time": "09:06",
                        "text": "You people are acting like the world ends over one invoice. I said I saw it. I am busy.",
                    },
                    {
                        "side": "right",
                        "time": "09:08",
                        "text": "Thanks. We still need a payment date for our records.",
                    },
                ],
            },
            {
                "type": "email",
                "file_name": "email-2026-03-11.png",
                "app_label": "Gmail",
                "account": "declan.pryce@pryceholdings.co.uk",
                "subject": "Re: overdue invoice INV-2026-0899",
                "from": "Declan Pryce <declan.pryce@pryceholdings.co.uk>",
                "to": f"Accounts <{COMPANY['accounts_email']}>",
                "sent": "Wed 11 Mar 2026 13:22",
                "body": [
                    "I have the invoice.",
                    "",
                    "What I do not have is patience for three reminders in as many days. If your accounts team had sent the paperwork in a cleaner format the first time, this would already be off my list.",
                    "",
                    "I will review it when I get back to the office tomorrow.",
                    "",
                    "Declan",
                ],
            },
            {
                "type": "whatsapp",
                "file_name": "whatsapp-2026-03-14.png",
                "contact": "Declan Pryce",
                "status": "online",
                "day_label": "Saturday 14 March 2026",
                "accent": "#fde68a",
                "messages": [
                    {
                        "side": "right",
                        "time": "11:03",
                        "text": "Declan, we have still not received payment or a firm date. Please confirm by midday Monday to avoid escalation.",
                    },
                    {
                        "side": "left",
                        "time": "11:11",
                        "text": "Escalate whatever you like. The work was fine, your chasing is the irritating part.",
                    },
                    {
                        "side": "left",
                        "time": "11:12",
                        "text": "I am not dropping weekend plans because your ledger wants comforting.",
                    },
                    {
                        "side": "right",
                        "time": "11:18",
                        "text": "Noted. We still require a payment date.",
                    },
                ],
            },
            {
                "type": "sms",
                "file_name": "sms-2026-03-18.png",
                "contact": "Declan Pryce",
                "day_label": "Wednesday 18 March 2026",
                "messages": [
                    {
                        "side": "right",
                        "time": "16:02",
                        "text": "We have not received the promised update for INV-2026-0899. Please reply today with the payment date.",
                    },
                    {
                        "side": "left",
                        "time": "16:19",
                        "text": "Put down Friday if you need to type something in your spreadsheet.",
                    },
                    {
                        "side": "right",
                        "time": "16:21",
                        "text": "Thanks. Please confirm whether that is Friday 20 March 2026 for the full balance.",
                    },
                    {
                        "side": "left",
                        "time": "16:28",
                        "text": "If nothing explodes between now and then, yes.",
                    },
                ],
            },
            {
                "type": "email",
                "file_name": "email-2026-03-20.png",
                "app_label": "Mail",
                "account": "declan.pryce@pryceholdings.co.uk",
                "subject": "Payment still pending",
                "from": "Declan Pryce <declan.pryce@pryceholdings.co.uk>",
                "to": f"Credit Control <{COMPANY['accounts_email']}>",
                "sent": "Fri 20 Mar 2026 17:48",
                "body": [
                    "Before anyone sends message number ten, no, the payment has not gone today.",
                    "",
                    "My bank cut-off moved and I was not going to leave a meeting to satisfy your timetable. I can look at it next week.",
                    "",
                    "Declan Pryce",
                ],
                "mobile": True,
            },
            {
                "type": "email",
                "file_name": "email-2026-03-27.png",
                "app_label": "Mail",
                "account": "declan.pryce@pryceholdings.co.uk",
                "subject": "Final note on INV-2026-0899",
                "from": "Declan Pryce <declan.pryce@pryceholdings.co.uk>",
                "to": f"Accounts <{COMPANY['accounts_email']}>",
                "sent": "Fri 27 Mar 2026 09:31",
                "body": [
                    "I have paid the invoice this morning.",
                    "",
                    "For future reference, if your team sends fewer breathless reminders, people might respond faster.",
                    "",
                    "You should see the funds later today.",
                    "",
                    "Declan",
                ],
            },
        ],
    },
]


def format_lines(lines: list[str]) -> str:
    return "<br />".join(escape(line) for line in lines)


def initials(name: str) -> str:
    return "".join(part[0] for part in name.split()[:2]).upper()


def invoice_html(invoice: dict) -> str:
    rows = "".join(
        f"""
        <tr>
          <td>{escape(item)}</td>
          <td>{escape(qty)}</td>
          <td>GBP {escape(rate)}</td>
          <td>GBP {escape(total)}</td>
        </tr>
        """
        for item, qty, rate, total in invoice["rows"]
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: A4; margin: 18mm; }}
    body {{ margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #172033; background: #f6f7fb; }}
    .sheet {{ width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 20mm; box-sizing: border-box; }}
    .hero {{ display: flex; justify-content: space-between; gap: 24px; align-items: start; }}
    .brand h1 {{ margin: 0; font-size: 31px; line-height: 1.08; color: {invoice["accent"]}; }}
    .brand p, .meta p, .card p, .footer p {{ margin: 0; font-size: 13px; line-height: 1.55; color: #475569; }}
    .pill {{ display: inline-block; margin-top: 14px; padding: 8px 14px; border-radius: 999px; background: {invoice["accent"]}; color: white; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }}
    .meta {{ min-width: 240px; padding: 16px 18px; border-radius: 18px; background: linear-gradient(180deg, {invoice["accent"]}14, rgba(255,255,255,1)); border: 1px solid {invoice["accent"]}33; }}
    .meta strong {{ display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; margin-bottom: 4px; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 28px; }}
    .card {{ border: 1px solid #dbe4ef; border-radius: 18px; padding: 18px; }}
    .card h2 {{ margin: 0 0 10px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }}
    .table-wrap {{ margin-top: 28px; border: 1px solid #dbe4ef; border-radius: 18px; overflow: hidden; }}
    table {{ width: 100%; border-collapse: collapse; }}
    thead th {{ background: {invoice["accent"]}; color: white; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; padding: 14px 16px; text-align: left; }}
    tbody td {{ border-top: 1px solid #e5edf5; padding: 14px 16px; font-size: 14px; color: #1e293b; }}
    .summary {{ margin-top: 18px; margin-left: auto; width: 250px; }}
    .summary-row {{ display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #334155; }}
    .summary-row.total {{ border-top: 1px solid #cbd5e1; margin-top: 4px; padding-top: 12px; font-size: 18px; font-weight: 700; color: {invoice["accent"]}; }}
    .note {{ margin-top: 22px; border-radius: 18px; background: #f8fafc; padding: 16px 18px; border: 1px dashed #cbd5e1; }}
    .footer {{ margin-top: 26px; padding-top: 18px; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div class="brand">
        <h1>{escape(COMPANY["name"])}</h1>
        <p>{format_lines(COMPANY["address"])}</p>
        <p>{escape(COMPANY["accounts_email"])}<br />{escape(COMPANY["phone"])}</p>
        <div class="pill">Invoice</div>
      </div>
      <div class="meta">
        <strong>Invoice number</strong>
        <p>{escape(invoice["invoice_number"])}</p>
        <strong style="margin-top:12px;">Issue date</strong>
        <p>{escape(invoice["issue_date"])}</p>
        <strong style="margin-top:12px;">Due date</strong>
        <p>{escape(invoice["due_date"])}</p>
        <strong style="margin-top:12px;">Reference</strong>
        <p>{escape(invoice["reference"])}</p>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Bill to</h2>
        <p><strong>{escape(invoice["customer"]["name"])}</strong><br />{format_lines(invoice["customer"]["address"])}</p>
      </div>
      <div class="card">
        <h2>Work summary</h2>
        <p>{escape(invoice["note"])}</p>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>

    <div class="summary">
      <div class="summary-row"><span>Subtotal</span><span>GBP {escape(invoice["subtotal"])}</span></div>
      <div class="summary-row"><span>VAT</span><span>GBP {escape(invoice["vat"])}</span></div>
      <div class="summary-row total"><span>Total due</span><span>GBP {escape(invoice["total"])}</span></div>
    </div>

    <div class="note">
      <p>{escape(invoice["footer"])}</p>
    </div>

    <div class="footer">
      <p>Prepared by {escape(COMPANY["short_name"])} accounts desk.</p>
    </div>
  </div>
</body>
</html>"""


def whatsapp_html(thread: dict) -> str:
    bubbles = "".join(
        f"""
        <div class="row {'right' if message['side'] == 'right' else 'left'}">
          <div class="bubble {'outgoing' if message['side'] == 'right' else 'incoming'}">
            <p>{escape(message['text'])}</p>
            <span>{escape(message['time'])}</span>
          </div>
        </div>
        """
        for message in thread["messages"]
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #d5dbd4; }}
    .phone {{
      width: 420px; min-height: 880px; margin: 0 auto; background:
        radial-gradient(circle at top, rgba(255,255,255,0.6), transparent 30%),
        linear-gradient(180deg, #efeae2, #e9e2d7);
      position: relative; box-sizing: border-box; overflow: hidden;
    }}
    .topbar {{
      background: #0b141a; color: white; padding: 16px 18px 14px; display: flex; align-items: center; gap: 12px;
    }}
    .avatar {{
      width: 42px; height: 42px; border-radius: 50%; background: #6b7280; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700;
    }}
    .meta strong {{ display: block; font-size: 17px; }}
    .meta span {{ color: #cbd5e1; font-size: 12px; }}
    .date-chip {{
      margin: 18px auto 8px; width: fit-content; background: #fff7d6; color: #475569; font-size: 12px; padding: 7px 12px; border-radius: 999px; box-shadow: 0 1px 0 rgba(0,0,0,0.08);
    }}
    .chat {{ padding: 0 14px 16px; }}
    .row {{ display: flex; margin: 10px 0; }}
    .row.right {{ justify-content: flex-end; }}
    .bubble {{
      max-width: 78%; padding: 10px 12px 18px; border-radius: 14px; position: relative; box-shadow: 0 1px 0 rgba(0,0,0,0.08);
    }}
    .incoming {{ background: white; }}
    .outgoing {{ background: {thread["accent"]}; }}
    .bubble p {{ margin: 0; color: #111827; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }}
    .bubble span {{ position: absolute; right: 10px; bottom: 6px; font-size: 11px; color: #6b7280; }}
    .composer {{
      position: absolute; left: 0; right: 0; bottom: 0; background: #f0f2f5; padding: 12px 14px 16px;
    }}
    .composer-inner {{
      border-radius: 24px; background: white; color: #94a3b8; padding: 13px 16px; font-size: 14px;
    }}
  </style>
</head>
<body>
  <div class="phone">
    <div class="topbar">
      <div class="avatar">{escape(initials(thread["contact"]))}</div>
      <div class="meta">
        <strong>{escape(thread["contact"])}</strong>
        <span>{escape(thread["status"])}</span>
      </div>
    </div>
    <div class="date-chip">{escape(thread["day_label"])}</div>
    <div class="chat">{bubbles}</div>
    <div class="composer">
      <div class="composer-inner">Message</div>
    </div>
  </div>
</body>
</html>"""


def sms_html(thread: dict) -> str:
    bubbles = "".join(
        f"""
        <div class="row {'right' if message['side'] == 'right' else 'left'}">
          <div class="bubble {'outgoing' if message['side'] == 'right' else 'incoming'}">
            <p>{escape(message['text'])}</p>
            <span>{escape(message['time'])}</span>
          </div>
        </div>
        """
        for message in thread["messages"]
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #e5e7eb; }}
    .phone {{
      width: 414px; min-height: 896px; margin: 0 auto; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
      position: relative; overflow: hidden; border-left: 1px solid #d1d5db; border-right: 1px solid #d1d5db;
    }}
    .header {{
      text-align: center; padding: 30px 20px 10px; border-bottom: 1px solid #e5e7eb; background: rgba(255,255,255,0.96);
    }}
    .header strong {{ display: block; font-size: 17px; color: #1f2937; }}
    .header span {{ font-size: 12px; color: #6b7280; }}
    .date-chip {{
      margin: 16px auto 10px; width: fit-content; background: #e5e7eb; color: #6b7280; font-size: 12px; padding: 6px 12px; border-radius: 999px;
    }}
    .chat {{ padding: 0 12px 80px; }}
    .row {{ display: flex; margin: 10px 0; }}
    .row.right {{ justify-content: flex-end; }}
    .bubble {{
      max-width: 78%; padding: 12px 14px 18px; border-radius: 18px; position: relative;
    }}
    .incoming {{ background: #f3f4f6; }}
    .outgoing {{ background: #1f8fff; color: white; }}
    .bubble p {{ margin: 0; font-size: 14px; line-height: 1.45; white-space: pre-wrap; color: inherit; }}
    .bubble span {{ position: absolute; right: 12px; bottom: 6px; font-size: 11px; color: rgba(255,255,255,0.82); }}
    .incoming span {{ color: #6b7280; }}
    .composer {{
      position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 12px 16px; border-top: 1px solid #e5e7eb; background: rgba(255,255,255,0.96);
    }}
    .composer-inner {{
      border: 1px solid #d1d5db; border-radius: 24px; padding: 11px 16px; color: #94a3b8; font-size: 14px;
    }}
  </style>
</head>
<body>
  <div class="phone">
    <div class="header">
      <strong>{escape(thread["contact"])}</strong>
      <span>Text Message</span>
    </div>
    <div class="date-chip">{escape(thread["day_label"])}</div>
    <div class="chat">{bubbles}</div>
    <div class="composer">
      <div class="composer-inner">iMessage</div>
    </div>
  </div>
</body>
</html>"""


def email_html(email: dict) -> str:
    body = "".join(
        f"<p>{escape(line)}</p>" if line else '<div class="spacer"></div>'
        for line in email["body"]
    )
    mobile = email.get("mobile", False)
    width = 430 if mobile else 1180
    sidebar = "" if mobile else """
    <aside class="sidebar">
      <div class="compose">Compose</div>
      <ul>
        <li class="active">Inbox</li>
        <li>Starred</li>
        <li>Sent</li>
        <li>Drafts</li>
      </ul>
    </aside>
    """

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #eef2f7; }}
    .frame {{
      width: {width}px; min-height: {'860' if mobile else '760'}px; margin: 0 auto; background: white; box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12);
      display: flex; overflow: hidden;
    }}
    .sidebar {{
      width: 220px; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 18px;
    }}
    .compose {{
      width: fit-content; padding: 12px 18px; border-radius: 16px; background: #dbeafe; color: #1d4ed8; font-weight: 700; margin-bottom: 20px;
    }}
    .sidebar ul {{ list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; color: #475569; font-size: 14px; }}
    .sidebar li.active {{ color: #111827; font-weight: 700; }}
    .main {{ flex: 1; display: flex; flex-direction: column; }}
    .toolbar {{ height: 62px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 20px; gap: 10px; color: #64748b; }}
    .subject {{ padding: 22px 24px 12px; font-size: {'24' if mobile else '30'}px; line-height: 1.18; color: #0f172a; font-weight: 700; }}
    .meta {{ padding: 0 24px 20px; display: grid; gap: 6px; border-bottom: 1px solid #e2e8f0; }}
    .meta div {{ font-size: 14px; color: #334155; }}
    .label {{ color: #64748b; display: inline-block; width: 56px; }}
    .body {{ padding: 24px; font-size: {'18' if mobile else '16'}px; line-height: 1.6; color: #111827; }}
    .body p {{ margin: 0 0 10px; }}
    .spacer {{ height: 12px; }}
  </style>
</head>
<body>
  <div class="frame">
    {sidebar}
    <main class="main">
      <div class="toolbar">{escape(email["app_label"])} - {escape(email["account"])}</div>
      <div class="subject">{escape(email["subject"])}</div>
      <div class="meta">
        <div><span class="label">From</span>{escape(email["from"])}</div>
        <div><span class="label">To</span>{escape(email["to"])}</div>
        <div><span class="label">Sent</span>{escape(email["sent"])}</div>
      </div>
      <div class="body">{body}</div>
    </main>
  </div>
</body>
</html>"""


async def ensure_clean_bundle_directory(bundle_slug: str) -> Path:
    bundle_dir = OUTPUT_DIR / bundle_slug
    if bundle_dir.exists():
        for item in bundle_dir.iterdir():
            item.unlink()
    else:
        bundle_dir.mkdir(parents=True, exist_ok=True)
    return bundle_dir


async def render_invoice(browser, bundle_dir: Path, invoice: dict) -> None:
    page = await browser.new_page(viewport={"width": 1240, "height": 1754}, device_scale_factor=1.5)
    await page.set_content(invoice_html(invoice), wait_until="load")
    await page.emulate_media(media="screen")
    await page.pdf(
        path=str(bundle_dir / invoice["file_name"]),
        format="A4",
        print_background=True,
        margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
    )
    await page.close()


async def render_asset(browser, bundle_dir: Path, asset: dict) -> None:
    if asset["type"] == "email":
        mobile = asset.get("mobile", False)
        viewport = {"width": 430, "height": 860} if mobile else {"width": 1180, "height": 760}
        html = email_html(asset)
    elif asset["type"] == "sms":
        viewport = {"width": 414, "height": 896}
        html = sms_html(asset)
    else:
        viewport = {"width": 420, "height": 900}
        html = whatsapp_html(asset)

    page = await browser.new_page(viewport=viewport, device_scale_factor=2)
    await page.set_content(html, wait_until="load")
    await page.screenshot(path=str(bundle_dir / asset["file_name"]), full_page=True)
    await page.close()


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        try:
            for bundle in BUNDLES:
                bundle_dir = await ensure_clean_bundle_directory(bundle["slug"])
                await render_invoice(browser, bundle_dir, bundle["invoice"])
                for asset in bundle["assets"]:
                    await render_asset(browser, bundle_dir, asset)
                print(f"Generated sample_data/{bundle['slug']}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
