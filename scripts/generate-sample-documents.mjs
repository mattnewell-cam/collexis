import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'public', 'sample-documents');

const company = {
  name: 'Northgate Property Services Ltd',
  shortName: 'Northgate Property Services',
  address: ['41 Armitage Street', 'Bristol BS3 5NE'],
  accountsEmail: 'accounts@northgateps.co.uk',
  creditEmail: 'creditcontrol@northgateps.co.uk',
  phone: '0117 496 2184',
};

const invoices = [
  {
    slug: 'northgate-burst-pipe-final',
    jobId: '1',
    title: 'Burst pipe final invoice',
    accent: '#0f766e',
    customer: {
      name: 'Patricia Whitmore',
      address: ['14 Elmfield Road', 'Bristol BS3 4DQ'],
    },
    invoiceNumber: 'INV-2026-0418',
    issueDate: '18 March 2026',
    dueDate: '25 March 2026',
    reference: 'Emergency burst pipe repair',
    note: 'Final invoice for emergency attendance, copper pipe replacement, leak test, and kitchen unit refit. Payment terms 7 days.',
    footer: 'Bank transfer preferred. Please quote invoice number on payment. Late payment interest may be charged after the due date.',
    rows: [
      ['Emergency call-out and isolation', '1', '185.00', '185.00'],
      ['22mm pipe section and compression fittings', '1', '96.00', '96.00'],
      ['Replacement labour and leak test', '3.5 hrs', '84.00', '294.00'],
      ['Kitchen unit removal / refit', '1', '68.00', '68.00'],
    ],
    subtotal: '643.00',
    vat: '128.60',
    total: '771.60',
  },
  {
    slug: 'northgate-consumer-unit-commercial',
    jobId: '2',
    title: 'Consumer unit upgrade commercial invoice',
    accent: '#1d4ed8',
    customer: {
      name: 'Holt Commercial Ltd',
      address: ['9 Cavendish Place', 'Leeds LS1 2HG'],
    },
    invoiceNumber: 'INV-2026-0527',
    issueDate: '07 February 2026',
    dueDate: '21 February 2026',
    reference: 'Consumer unit upgrade and certification',
    note: 'Commercial works completed over two visits, including board swap, SPD fit, labelling, and NICEIC certification pack. Prior quote approved on signed worksheet.',
    footer: 'Payment terms: 14 days from issue. Queries should be raised with credit control within 5 working days.',
    rows: [
      ['18-way dual RCD consumer unit with SPD', '1', '790.00', '790.00'],
      ['Removal, install, and retermination labour', '2 days', '520.00', '1040.00'],
      ['Testing, certification, and labelling', '1', '285.00', '285.00'],
      ['DNO coordination and site attendance', '1', '140.00', '140.00'],
    ],
    subtotal: '2255.00',
    vat: '451.00',
    total: '2706.00',
  },
  {
    slug: 'northgate-heating-install-balance',
    jobId: '8',
    title: 'Central heating balance invoice',
    accent: '#92400e',
    customer: {
      name: 'Miriam Okonkwo',
      address: ['61 Hazel Grove', 'Sheffield S7 2DF'],
    },
    invoiceNumber: 'INV-2026-0614',
    issueDate: '10 March 2026',
    dueDate: '17 March 2026',
    reference: 'Central heating installation balance',
    note: 'Balance invoice covering Worcester boiler supply, radiator installation, full pipework, controls, commissioning, and handover documents.',
    footer: 'Please pay within 7 days. If you need a copy of the commissioning record, email accounts@northgateps.co.uk.',
    rows: [
      ['Worcester Bosch boiler and flue kit', '1', '1240.00', '1240.00'],
      ['Radiators, valves, and controls', '1', '820.00', '820.00'],
      ['Installation labour and commissioning', '3 days', '640.00', '1920.00'],
      ['System flush and certification pack', '1', '220.00', '220.00'],
    ],
    subtotal: '4200.00',
    vat: '840.00',
    total: '5040.00',
  },
];

const whatsappThreads = [
  {
    slug: 'patricia-payment-friday',
    jobId: '1',
    title: 'WhatsApp thread with payment promise',
    contact: 'Patricia Whitmore',
    status: 'online',
    accent: '#dcf8c6',
    dayLabel: 'Today',
    messages: [
      { side: 'left', time: '09:08', text: 'Morning. I have seen your invoice reminder. I am waiting for insurance to confirm the burst pipe claim.' },
      { side: 'right', time: '09:12', text: 'Thanks Patricia. Please let us know when payment can be released.' },
      { side: 'left', time: '09:14', text: 'They said Friday afternoon if all checks clear. If not, I can make a part payment first.' },
      { side: 'right', time: '09:16', text: 'That is helpful. Please confirm by 3pm on Friday either way.' },
    ],
  },
  {
    slug: 'holt-accounts-query',
    jobId: '2',
    title: 'WhatsApp thread disputing an amount',
    contact: 'Mark Holt',
    status: 'last seen today at 11:42',
    accent: '#fef3c7',
    dayLabel: 'Tuesday',
    messages: [
      { side: 'left', time: '11:21', text: 'Your invoice is above the amount my site team expected. Can you resend the signed sheet and final certificate pack?' },
      { side: 'right', time: '11:25', text: 'Sure. I have the signed quote here and it shows the full agreed amount before VAT.' },
      { side: 'left', time: '11:29', text: 'Send that over and I will push it through again this afternoon.' },
      { side: 'right', time: '11:31', text: 'Will do. Once reviewed, please confirm the payment date.' },
    ],
  },
  {
    slug: 'miriam-split-payment',
    jobId: '8',
    title: 'WhatsApp thread offering instalments',
    contact: 'Miriam Okonkwo',
    status: 'typing...',
    accent: '#dbeafe',
    dayLabel: 'Thursday',
    messages: [
      { side: 'left', time: '18:04', text: 'I cannot clear the whole heating invoice this week. I can send GBP 1200 now and the rest after payday on the 28th.' },
      { side: 'right', time: '18:09', text: 'Please put the proposal in writing here, including the exact date for the balance.' },
      { side: 'left', time: '18:11', text: 'Yes. GBP 1200 tonight and GBP 3100 on 28 March 2026. I am not disputing the work.' },
    ],
  },
];

const emailScreens = [
  {
    slug: 'patricia-insurance-update',
    jobId: '1',
    title: 'Email updating on insurance timing',
    appLabel: 'Mail',
    account: 'patricia.whitmore@gmail.com',
    subject: 'Re: INV-2026-0418 insurance update',
    from: 'Patricia Whitmore <patricia.whitmore@gmail.com>',
    to: `Accounts <${company.accountsEmail}>`,
    sent: 'Mon 16 Mar 2026 08:43',
    body: [
      'Morning,',
      '',
      'The insurer has told me they expect to release funds on Friday afternoon if the final claim review is completed in time.',
      '',
      'If they delay, I can make a part payment first and clear the balance once the claim is settled.',
      '',
      'Regards,',
      'Patricia',
    ],
  },
  {
    slug: 'holt-dispute-follow-up',
    jobId: '2',
    title: 'Email disputing part of an invoice',
    appLabel: 'Gmail',
    account: 'm.holt@holtcommercial.co.uk',
    subject: 'Query on consumer unit invoice',
    from: 'Mark Holt <m.holt@holtcommercial.co.uk>',
    to: `Credit Control <${company.creditEmail}>`,
    sent: 'Fri 20 Feb 2026 14:17',
    body: [
      'Hello,',
      '',
      'We are not refusing payment, but the figure on INV-2026-0527 is above what my site team expected. Please resend the signed quote and the certification pack so I can close this internally.',
      '',
      'Once I have those, I can confirm whether the balance will go this month.',
      '',
      'Best,',
      'Mark',
    ],
  },
  {
    slug: 'miriam-part-payment-mobile',
    jobId: '8',
    title: 'Mobile email offering part payment',
    appLabel: 'Mail',
    account: 'm.okonkwo@hotmail.co.uk',
    subject: 'Heating invoice payment plan',
    from: 'Miriam Okonkwo <m.okonkwo@hotmail.co.uk>',
    to: `Accounts <${company.accountsEmail}>`,
    sent: 'Thu 12 Mar 2026 19:05',
    body: [
      'Hi,',
      '',
      'I have made a transfer of GBP 1200 this evening and can pay the remaining GBP 3100 on 28 March once I am paid by my tenant.',
      '',
      'Please confirm the first payment has arrived when you can.',
      '',
      'Thanks,',
      'Miriam',
    ],
    mobile: true,
  },
];

const legacySampleFilenames = [
  'northgate-plumbing-final.pdf',
  'beacon-electrical-commercial.pdf',
  'maple-roofing-balance.pdf',
  'patricia-payment-friday.png',
  'holt-accounts-query.png',
  'miriam-split-payment.png',
  'email-payment-confirmation.png',
  'email-dispute-follow-up.png',
  'email-part-payment-mobile.png',
];

function invoiceHtml(invoice) {
  const rows = invoice.rows.map(([item, qty, rate, total]) => `
    <tr>
      <td>${item}</td>
      <td>${qty}</td>
      <td>GBP ${rate}</td>
      <td>GBP ${total}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 18mm; }
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #172033; background: #f6f7fb; }
      .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 20mm; box-sizing: border-box; }
      .hero { display: flex; justify-content: space-between; gap: 24px; align-items: start; }
      .brand h1 { margin: 0; font-size: 31px; line-height: 1.08; color: ${invoice.accent}; }
      .brand p, .meta p, .card p, .footer p { margin: 0; font-size: 13px; line-height: 1.55; color: #475569; }
      .pill { display: inline-block; margin-top: 14px; padding: 8px 14px; border-radius: 999px; background: ${invoice.accent}; color: white; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; }
      .meta { min-width: 240px; padding: 16px 18px; border-radius: 18px; background: linear-gradient(180deg, ${invoice.accent}14, rgba(255,255,255,1)); border: 1px solid ${invoice.accent}33; }
      .meta strong { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: #64748b; margin-bottom: 4px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 28px; }
      .card { border: 1px solid #dbe4ef; border-radius: 18px; padding: 18px; }
      .card h2 { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #64748b; }
      .table-wrap { margin-top: 28px; border: 1px solid #dbe4ef; border-radius: 18px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; }
      thead th { background: ${invoice.accent}; color: white; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; padding: 14px 16px; text-align: left; }
      tbody td { border-top: 1px solid #e5edf5; padding: 14px 16px; font-size: 14px; color: #1e293b; }
      .summary { margin-top: 18px; margin-left: auto; width: 250px; }
      .summary-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #334155; }
      .summary-row.total { border-top: 1px solid #cbd5e1; margin-top: 4px; padding-top: 12px; font-size: 18px; font-weight: 700; color: ${invoice.accent}; }
      .note { margin-top: 22px; border-radius: 18px; background: #f8fafc; padding: 16px 18px; border: 1px dashed #cbd5e1; }
      .footer { margin-top: 26px; padding-top: 18px; border-top: 1px solid #e2e8f0; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="hero">
        <div class="brand">
          <h1>${company.name}</h1>
          <p>${company.address.join('<br />')}</p>
          <p>${company.accountsEmail}<br />${company.phone}</p>
          <div class="pill">Invoice</div>
        </div>
        <div class="meta">
          <strong>Invoice number</strong>
          <p>${invoice.invoiceNumber}</p>
          <strong style="margin-top:12px;">Issue date</strong>
          <p>${invoice.issueDate}</p>
          <strong style="margin-top:12px;">Due date</strong>
          <p>${invoice.dueDate}</p>
          <strong style="margin-top:12px;">Reference</strong>
          <p>${invoice.reference}</p>
        </div>
      </div>

      <div class="grid">
        <div class="card">
          <h2>Bill to</h2>
          <p><strong>${invoice.customer.name}</strong><br />${invoice.customer.address.join('<br />')}</p>
        </div>
        <div class="card">
          <h2>Work summary</h2>
          <p>${invoice.note}</p>
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
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="summary">
        <div class="summary-row"><span>Subtotal</span><span>GBP ${invoice.subtotal}</span></div>
        <div class="summary-row"><span>VAT</span><span>GBP ${invoice.vat}</span></div>
        <div class="summary-row total"><span>Total due</span><span>GBP ${invoice.total}</span></div>
      </div>

      <div class="note">
        <p>${invoice.footer}</p>
      </div>

      <div class="footer">
        <p>Prepared by ${company.name} accounts desk.</p>
      </div>
    </div>
  </body>
  </html>`;
}

function whatsappHtml(thread) {
  const bubbles = thread.messages.map(message => `
    <div class="row ${message.side === 'right' ? 'right' : 'left'}">
      <div class="bubble ${message.side === 'right' ? 'outgoing' : 'incoming'}">
        <p>${message.text}</p>
        <span>${message.time}</span>
      </div>
    </div>
  `).join('');

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #d5dbd4; }
      .phone {
        width: 420px; min-height: 880px; margin: 0 auto; background:
          radial-gradient(circle at top, rgba(255,255,255,0.6), transparent 30%),
          linear-gradient(180deg, #efeae2, #e9e2d7);
        position: relative; box-sizing: border-box; overflow: hidden;
      }
      .topbar {
        background: #0b141a; color: white; padding: 16px 18px 14px; display: flex; align-items: center; gap: 12px;
      }
      .avatar {
        width: 42px; height: 42px; border-radius: 50%; background: #6b7280; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700;
      }
      .meta strong { display: block; font-size: 17px; }
      .meta span { color: #cbd5e1; font-size: 12px; }
      .date-chip {
        margin: 18px auto 8px; width: fit-content; background: #fff7d6; color: #475569; font-size: 12px; padding: 7px 12px; border-radius: 999px; box-shadow: 0 1px 0 rgba(0,0,0,0.08);
      }
      .chat { padding: 0 14px 16px; }
      .row { display: flex; margin: 10px 0; }
      .row.right { justify-content: flex-end; }
      .bubble {
        max-width: 78%; padding: 10px 12px 18px; border-radius: 14px; position: relative; box-shadow: 0 1px 0 rgba(0,0,0,0.08);
      }
      .incoming { background: white; }
      .outgoing { background: ${thread.accent}; }
      .bubble p { margin: 0; color: #111827; font-size: 14px; line-height: 1.45; white-space: pre-wrap; }
      .bubble span { position: absolute; right: 10px; bottom: 6px; font-size: 11px; color: #6b7280; }
      .composer {
        position: absolute; left: 0; right: 0; bottom: 0; background: #f0f2f5; padding: 12px 14px 16px;
      }
      .composer-inner {
        border-radius: 24px; background: white; color: #94a3b8; padding: 13px 16px; font-size: 14px;
      }
    </style>
  </head>
  <body>
    <div class="phone">
      <div class="topbar">
        <div class="avatar">${thread.contact.split(' ').map(part => part[0]).join('').slice(0, 2)}</div>
        <div class="meta">
          <strong>${thread.contact}</strong>
          <span>${thread.status}</span>
        </div>
      </div>
      <div class="date-chip">${thread.dayLabel}</div>
      <div class="chat">${bubbles}</div>
      <div class="composer">
        <div class="composer-inner">Message</div>
      </div>
    </div>
  </body>
  </html>`;
}

function emailHtml(email) {
  const body = email.body.map(line => line ? `<p>${line}</p>` : '<div class="spacer"></div>').join('');
  const width = email.mobile ? 430 : 1180;
  const sidebar = email.mobile ? '' : `
    <aside class="sidebar">
      <div class="compose">Compose</div>
      <ul>
        <li class="active">${email.appLabel}</li>
        <li>Starred</li>
        <li>Sent</li>
        <li>Drafts</li>
      </ul>
    </aside>
  `;

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #eef2f7; }
      .frame {
        width: ${width}px; min-height: ${email.mobile ? 860 : 760}px; margin: 0 auto; background: white; box-shadow: 0 12px 34px rgba(15, 23, 42, 0.12);
        display: flex; overflow: hidden;
      }
      .sidebar {
        width: 220px; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 18px;
      }
      .compose {
        width: fit-content; padding: 12px 18px; border-radius: 16px; background: #dbeafe; color: #1d4ed8; font-weight: 700; margin-bottom: 20px;
      }
      .sidebar ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; color: #475569; font-size: 14px; }
      .sidebar li.active { color: #111827; font-weight: 700; }
      .main { flex: 1; display: flex; flex-direction: column; }
      .toolbar { height: 62px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 20px; gap: 10px; color: #64748b; }
      .subject { padding: 22px 24px 12px; font-size: ${email.mobile ? 24 : 30}px; line-height: 1.18; color: #0f172a; font-weight: 700; }
      .meta { padding: 0 24px 20px; display: grid; gap: 6px; border-bottom: 1px solid #e2e8f0; }
      .meta div { font-size: 14px; color: #334155; }
      .label { color: #64748b; display: inline-block; width: 56px; }
      .body { padding: 24px; font-size: ${email.mobile ? 18 : 16}px; line-height: 1.6; color: #111827; }
      .body p { margin: 0 0 10px; }
      .spacer { height: 12px; }
    </style>
  </head>
  <body>
    <div class="frame">
      ${sidebar}
      <main class="main">
        <div class="toolbar">${email.appLabel} - ${email.account}</div>
        <div class="subject">${email.subject}</div>
        <div class="meta">
          <div><span class="label">From</span>${email.from}</div>
          <div><span class="label">To</span>${email.to}</div>
          <div><span class="label">Sent</span>${email.sent}</div>
        </div>
        <div class="body">${body}</div>
      </main>
    </div>
  </body>
  </html>`;
}

async function resetOutputDirectory() {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, 'invoices'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'whatsapp'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'emails'), { recursive: true });
}

async function renderInvoice(browser, invoice) {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1.5 });
  await page.setContent(invoiceHtml(invoice), { waitUntil: 'load' });
  await page.emulateMedia({ media: 'screen' });
  await page.pdf({
    path: path.join(outputDir, 'invoices', `${invoice.slug}.pdf`),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await page.close();
}

async function renderWhatsapp(browser, thread) {
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  await page.setContent(whatsappHtml(thread), { waitUntil: 'load' });
  await page.screenshot({
    path: path.join(outputDir, 'whatsapp', `${thread.slug}.png`),
    fullPage: true,
  });
  await page.close();
}

async function renderEmail(browser, email) {
  const page = await browser.newPage({
    viewport: email.mobile ? { width: 430, height: 860 } : { width: 1180, height: 760 },
    deviceScaleFactor: 2,
  });
  await page.setContent(emailHtml(email), { waitUntil: 'load' });
  await page.screenshot({
    path: path.join(outputDir, 'emails', `${email.slug}.png`),
    fullPage: true,
  });
  await page.close();
}

async function writeManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    company,
    legacySampleFilenames,
    categories: {
      invoices: invoices.map(item => ({
        slug: item.slug,
        jobId: item.jobId,
        title: item.title,
        format: 'pdf',
        path: `/sample-documents/invoices/${item.slug}.pdf`,
        notes: item.reference,
      })),
      whatsapp: whatsappThreads.map(item => ({
        slug: item.slug,
        jobId: item.jobId,
        title: item.title,
        format: 'png',
        path: `/sample-documents/whatsapp/${item.slug}.png`,
        notes: item.messages[0].text,
      })),
      emails: emailScreens.map(item => ({
        slug: item.slug,
        jobId: item.jobId,
        title: item.title,
        format: 'png',
        path: `/sample-documents/emails/${item.slug}.png`,
        notes: item.subject,
      })),
    },
  };

  await fs.writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );
}

async function main() {
  await resetOutputDirectory();
  const browser = await chromium.launch();
  try {
    for (const invoice of invoices) {
      await renderInvoice(browser, invoice);
    }
    for (const thread of whatsappThreads) {
      await renderWhatsapp(browser, thread);
    }
    for (const email of emailScreens) {
      await renderEmail(browser, email);
    }
  } finally {
    await browser.close();
  }

  await writeManifest();
  console.log(`Generated sample documents in ${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
