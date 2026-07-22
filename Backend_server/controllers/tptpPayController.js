// Phase 5.8 — TPTPpay merchant page + status API
const QRCode = require('qrcode');
const billingSelfService = require('../application/billing/billingSelfServiceApplicationService');
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
    const org = await billingSelfService.findOrganization(invoice.organization_id);
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
        const inv = await billingSelfService.findInvoice(invoiceId);
        if (inv?.status === 'PAID') return { invoice: inv };
      }
      throw e;
    });
    const invoice = await billingSelfService.findInvoice(invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    if (invoice.status === 'PAID') {
      return res.json({ status: 'PAID', invoice_number: invoice.invoice_number });
    }
    res.json({ status: invoice.status, invoice_number: invoice.invoice_number });
  } catch (e) {
    if (e.code === 'ALREADY_PAID') {
      const invoice = await billingSelfService.findInvoice(req.params.invoiceId);
      return res.json({ status: 'PAID', invoice_number: invoice?.invoice_number });
    }
    res.status(e.status || 500).json({ message: e.message });
  }
}

// ===== Trang xác nhận thanh toán gói CÁ NHÂN qua QR (mở trên điện thoại) =====
const { resolvePersonalPayment } = require('../services/personalPaymentService');

function esc(s) { return String(s == null ? '' : s).replace(/[<>"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function getPersonalPayPage(req, res) {
  try {
    const { id } = req.params;
    const { token } = req.query;
    let info;
    try {
      info = await resolvePersonalPayment(id, token);
    } catch (e) {
      return res.status(e.status || 400).send(errorPage('Không thể thanh toán', e.message || 'Đơn không hợp lệ'));
    }

    const amountStr = Number(info.amount || 0).toLocaleString('vi-VN');
    const paid = info.status === 'PAID';
    const expired = info.status === 'EXPIRED' || info.status === 'CANCELLED';

    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TPTPbank — Thanh toán PRO</title>
<style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#1e293b;border-radius:18px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.35);max-width:400px;width:100%}
.brand{color:#38bdf8;font-weight:700;font-size:1.15rem;margin-bottom:2px}
.merchant{color:#94a3b8;font-size:.85rem;margin-bottom:16px}
.amount{font-size:2rem;font-weight:700;color:#f8fafc;margin:8px 0}
.plan{display:inline-block;background:#334155;padding:4px 10px;border-radius:8px;font-size:.8rem;margin-bottom:8px}
.field{margin-top:14px}
.field label{display:block;font-size:.82rem;color:#cbd5e1;margin-bottom:5px}
.field input{width:100%;padding:12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:1rem}
.field input:focus{outline:none;border-color:#38bdf8}
.btn{width:100%;margin-top:18px;padding:14px;border:none;border-radius:10px;background:#22c55e;color:#04240f;font-weight:700;font-size:1rem;cursor:pointer}
.btn:disabled{opacity:.6}
.msg{display:none;margin-top:14px;padding:10px 12px;border-radius:9px;font-size:.85rem}
.msg.err{background:#450a0a;color:#fca5a5}
.state{text-align:center;padding:20px 0}
.state .ic{font-size:3rem}
.hint{color:#64748b;font-size:.75rem;margin-top:14px;text-align:center;line-height:1.5}
</style></head><body><div class="card">
<div class="brand">TPTPbank</div>
<div class="merchant">${esc(info.merchant)} · Gói ${esc(info.plan)} (${esc(info.months)} tháng)</div>
${paid
  ? `<div class="state"><div class="ic">✅</div><h2>Đã thanh toán</h2><p style="color:#94a3b8">Giao dịch đã hoàn tất. Bạn có thể quay lại thiết bị ban đầu.</p></div>`
  : expired
  ? `<div class="state"><div class="ic">⌛</div><h2>Đơn đã hết hạn</h2><p style="color:#94a3b8">Vui lòng tạo lại yêu cầu thanh toán trên thiết bị ban đầu.</p></div>`
  : `<span class="plan">Gói ${esc(info.plan)}</span>
<div class="amount">${amountStr} <small style="font-size:1rem">VND</small></div>
<p style="color:#94a3b8;font-size:.85rem">Đăng nhập ví TPTPbank để xác nhận thanh toán.</p>
<div class="field"><label>Email hoặc Số điện thoại ví</label><input id="acc" type="text" autocomplete="username" placeholder="email hoặc SĐT ví"></div>
<div class="field"><label>Mật khẩu ví</label><input id="pwd" type="password" autocomplete="current-password" placeholder="Mật khẩu ví"></div>
<button class="btn" id="btn" onclick="pay()">Xác nhận thanh toán ${amountStr} đ</button>
<div class="msg err" id="msg"></div>
<p class="hint">Số tiền sẽ được trừ trực tiếp từ số dư ví TPTPbank của bạn.</p>`}
</div>
<script>
const PAYMENT_ID=${JSON.stringify(String(id))};
const TOKEN=${JSON.stringify(String(token || ''))};
function showErr(m){var e=document.getElementById('msg');e.textContent=m;e.style.display='block';}
async function pay(){
  var acc=document.getElementById('acc').value.trim();
  var pwd=document.getElementById('pwd').value;
  var btn=document.getElementById('btn');
  document.getElementById('msg').style.display='none';
  if(!acc||!pwd){showErr('Vui lòng nhập tài khoản và mật khẩu ví.');return;}
  btn.disabled=true;btn.textContent='Đang xử lý…';
  try{
    var loginBody={password:pwd};
    if(acc.indexOf('@')>=0)loginBody.email=acc;else loginBody.phone=acc;
    var lr=await fetch('/api/tptp-bank/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(loginBody)});
    var ld=await lr.json();
    if(!lr.ok){showErr(ld.message||'Đăng nhập ví thất bại.');btn.disabled=false;btn.textContent='Xác nhận thanh toán';return;}
    var cr=await fetch('/api/tptp-bank/pay/confirm-personal',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+ld.token},body:JSON.stringify({payment_id:PAYMENT_ID,payment_token:TOKEN})});
    var cd=await cr.json();
    if(!cr.ok){showErr(cd.message||'Thanh toán thất bại.');btn.disabled=false;btn.textContent='Xác nhận thanh toán';return;}
    document.body.innerHTML='<div class="card" style="text-align:center"><div style="font-size:3rem">✅</div><h2 style="color:#22c55e">Thanh toán thành công!</h2><p style="color:#94a3b8">Gói PRO đã được kích hoạt. Quay lại thiết bị ban đầu để tiếp tục.</p></div>';
  }catch(e){showErr('Lỗi kết nối: '+e.message);btn.disabled=false;btn.textContent='Xác nhận thanh toán';}
}
</script></body></html>`);
  } catch (e) {
    res.status(e.status || 500).send(errorPage('Lỗi', e.message || 'Lỗi máy chủ'));
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
  getBankLink,
  getPersonalPayPage
};
