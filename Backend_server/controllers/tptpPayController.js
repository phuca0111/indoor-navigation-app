// Phase 5.8 — TPTPpay merchant page + status API
const QRCode = require('qrcode');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const { assertPaymentAccess } = require('../services/paymentSessionGuard');
const {
  buildTptpBankQrPayload,
  buildTptpBankLinkUrl,
  isTptpSandboxEnabled
} = require('../services/tptpSandboxService');

function sandboxDisabledPage() {
  return '<h1>TPTP Sandbox đã tắt</h1><p>Cấu hình TPTP_SANDBOX_ENABLED=true hoặc dùng VNPay.</p>';
}

function errorPage(title, message) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:20px}
.err{color:#b91c1c}</style></head><body>
<h1>${title}</h1><p class="err">${message}</p>
<p><a href="/admin/dashboard.html#billing">Quay lại dashboard</a></p></body></html>`;
}

async function getPayPage(req, res) {
  try {
    if (!isTptpSandboxEnabled()) {
      return res.status(403).send(sandboxDisabledPage());
    }
    const { invoiceId } = req.params;
    const { token } = req.query;
    const { invoice } = await assertPaymentAccess(invoiceId, token);
    const org = await Organization.findById(invoice.organization_id).select('name slug').lean();
    const amount = Number(invoice.amount || 0).toLocaleString('vi-VN');
    const plan = invoice.plan || 'PRO';
    const merchant = org?.name || org?.slug || 'Indoor Nav SaaS';
    const qrPayload = buildTptpBankQrPayload(invoiceId, token);
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 240, margin: 1, errorCorrectionLevel: 'M' });
    const exp = invoice.metadata?.payment_token_exp
      ? new Date(invoice.metadata.payment_token_exp).toLocaleString('vi-VN')
      : '—';

    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TPTPpay — Thanh toán</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;min-height:100vh}
.wrap{max-width:440px;margin:0 auto;padding:24px}
.card{background:#1e293b;border-radius:16px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.3)}
h1{font-size:1.25rem;margin:0 0 4px;color:#38bdf8}
.merchant{color:#94a3b8;font-size:.9rem;margin-bottom:16px}
.amount{font-size:2rem;font-weight:700;color:#f8fafc;margin:12px 0}
.plan{display:inline-block;background:#334155;padding:4px 10px;border-radius:8px;font-size:.85rem}
#qr{display:flex;justify-content:center;margin:20px 0;padding:16px;background:#fff;border-radius:12px}
#qr img{display:block;width:220px;height:220px}
.status{text-align:center;padding:12px;border-radius:8px;margin-top:16px;font-size:.9rem}
.waiting{background:#422006;color:#fcd34d}
.paid{background:#14532d;color:#86efac}
.note{color:#64748b;font-size:.8rem;margin-top:12px;text-align:center}
.btn{display:block;text-align:center;margin-top:16px;padding:12px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none}
</style></head><body><div class="wrap"><div class="card">
<h1>TPTPpay</h1>
<p class="merchant">${merchant}</p>
<p class="amount">${amount} <small style="font-size:1rem">VND</small></p>
<span class="plan">Gói ${plan}</span>
<p class="note">Hóa đơn: ${invoice.invoice_number}</p>
<div id="qr"><img src="${qrDataUrl}" alt="QR thanh toán TPTPbank" width="220" height="220"></div>
<div id="statusBox" class="status waiting">⏳ Đang chờ thanh toán qua TPTPbank…</div>
<p class="note">Mở app <strong>TPTPbank</strong> → Quét QR → Xác nhận<br>Hết hạn: ${exp}</p>
<p class="note" style="word-break:break-all;font-size:.7rem">QR: ${qrPayload.replace(/</g, '')}</p>
<a class="btn" href="${qrPayload.replace(/"/g, '&quot;')}" id="bankLink">Mở TPTPbank (fallback)</a>
</div></div>
<script>
const invoiceId='${invoiceId}';
const token=${JSON.stringify(token)};
async function poll(){
  try{
    const r=await fetch('/api/tptp-pay/status/'+invoiceId+'?token='+encodeURIComponent(token));
    const d=await r.json();
    if(d.status==='PAID'){
      document.getElementById('statusBox').className='status paid';
      document.getElementById('statusBox').textContent='✅ Đã thanh toán — đang chuyển về dashboard…';
      setTimeout(()=>location.href='/admin/dashboard.html#billing?paid=1',1500);
      return;
    }
  }catch(e){}
  setTimeout(poll,2500);
}
poll();
</script></body></html>`);
  } catch (e) {
    res.status(e.status || 500).send(errorPage('Không thể thanh toán', e.message || 'Lỗi máy chủ'));
  }
}

async function getPaymentStatus(req, res) {
  try {
    const { invoiceId } = req.params;
    const { token } = req.query;
    await assertPaymentAccess(invoiceId, token).catch(async (e) => {
      if (e.code === 'ALREADY_PAID') {
        const inv = await Invoice.findById(invoiceId);
        if (inv?.status === 'PAID') return { invoice: inv };
      }
      throw e;
    });
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    if (invoice.status === 'PAID') {
      return res.json({ status: 'PAID', invoice_number: invoice.invoice_number });
    }
    res.json({ status: invoice.status, invoice_number: invoice.invoice_number });
  } catch (e) {
    if (e.code === 'ALREADY_PAID') {
      const invoice = await Invoice.findById(req.params.invoiceId);
      return res.json({ status: 'PAID', invoice_number: invoice?.invoice_number });
    }
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function getBankLink(req, res) {
  try {
    const { invoiceId, token } = req.query;
    if (!invoiceId || !token) {
      return res.status(400).json({ message: 'Thiếu tham số.' });
    }
    const data = await require('../services/bankWalletService').resolvePaymentFromQr({ invoiceId, token });
    res.json({
      ...data,
      deep_link: `tptpbank://pay?invoiceId=${encodeURIComponent(invoiceId)}&token=${encodeURIComponent(token)}`
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

module.exports = {
  getPayPage,
  getPaymentStatus,
  getBankLink
};
