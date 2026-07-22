const {
  assertBalanced,
  buildPosting,
  postTransaction,
  postTransfer,
  ACCOUNTS
} = require('../../services/unifiedLedger');
const {
  sanitizePayload,
  receiveWebhook,
  processWebhook
} = require('../../services/webhookInboxService');
const { classifyReconciliation } = require('../../services/reconciliationService');
const { buildReceiptSnapshot } = require('../../services/receiptService');
const { toCsv, parseCsv } = require('../../services/financeReports');
const { executeDebitWithCompensation } = require('../../services/bankWalletService');
const { validateVnpayBusinessData } = require('../../services/vnpayReconciliation');
const { getAdapter } = require('../../services/paymentGatewayAdapter');

describe('billing-finance v2 unit', () => {
  test('20 webhook song song chỉ tạo một inbox', async () => {
    const rows = new Map();
    const Inbox = {
      create: jest.fn(async (doc) => {
        const key = `${doc.provider}:${doc.event_key}`;
        if (rows.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 });
        rows.set(key, { _id: 'inbox-1', ...doc });
        return rows.get(key);
      }),
      findOne: jest.fn(async ({ provider, event_key }) => rows.get(`${provider}:${event_key}`))
    };
    const results = await Promise.all(Array.from({ length: 20 }, () => receiveWebhook({
      provider: 'VNPAY',
      event_key: 'TX-20',
      payload: { vnp_TransactionNo: 'TX-20' },
      signatureStatus: 'VALID'
    }, { WebhookInbox: Inbox })));
    expect(results.filter((item) => !item.duplicated)).toHaveLength(1);
    expect(rows.size).toBe(1);
  });

  test('claim xử lý webhook là idempotent', async () => {
    let claimed = false;
    let status = 'RECEIVED';
    const Inbox = {
      findOneAndUpdate: jest.fn(async () => {
        if (claimed) return null;
        claimed = true;
        status = 'PROCESSING';
        return { _id: '1' };
      }),
      findById: jest.fn(async () => ({ _id: '1', process_status: status })),
      updateOne: jest.fn(async (_, update) => { status = update.$set.process_status; })
    };
    const handler = jest.fn(async () => 'ok');
    const [first, second] = await Promise.all([
      processWebhook({ _id: '1' }, handler, { WebhookInbox: Inbox }),
      processWebhook({ _id: '1' }, handler, { WebhookInbox: Inbox })
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
    expect([first.duplicated, second.duplicated].sort()).toEqual([false, true]);
  });

  test('payload webhook được che secret', () => {
    expect(sanitizePayload({ token: 'x', nested: { password: 'y', amount: 10 } }))
      .toEqual({ token: '[REDACTED]', nested: { password: '[REDACTED]', amount: 10 } });
  });

  test('VNPay đối chiếu amount/currency/terminal/provider ref', () => {
    const invoice = { amount: 100, discount_amount: 5, tax_amount: 10, currency: 'VND' };
    const valid = {
      vnp_Amount: 10500,
      vnp_CurrCode: 'VND',
      vnp_TmnCode: 'MERCHANT-1',
      vnp_TransactionNo: 'TX-1'
    };
    expect(validateVnpayBusinessData(valid, invoice, 'MERCHANT-1')).toEqual({ ok: true });
    expect(validateVnpayBusinessData({ ...valid, vnp_Amount: 10400 }, invoice, 'MERCHANT-1').message)
      .toBe('Invalid amount');
    expect(validateVnpayBusinessData({ ...valid, vnp_CurrCode: 'USD' }, invoice, 'MERCHANT-1').message)
      .toBe('Invalid currency');
    expect(validateVnpayBusinessData({ ...valid, vnp_TmnCode: 'OTHER' }, invoice, 'MERCHANT-1').message)
      .toBe('Invalid terminal');
    expect(validateVnpayBusinessData({ ...valid, vnp_TransactionNo: '' }, invoice, 'MERCHANT-1').message)
      .toBe('Missing provider reference');
  });

  test('adapter báo provider-ready thay vì fallback mock', async () => {
    const old = process.env.VNPAY_TMN_CODE;
    delete process.env.VNPAY_TMN_CODE;
    const result = await getAdapter('VNPAY').createCheckout({
      amount: 100,
      merchant_ref: 'INV-1',
      description: 'test'
    });
    expect(result).toMatchObject({ ready: false, provider: 'VNPAY', code: 'PROVIDER_NOT_CONFIGURED' });
    if (old === undefined) delete process.env.VNPAY_TMN_CODE;
    else process.env.VNPAY_TMN_CODE = old;
  });

  test('ledger income cân bằng', () => {
    const entries = buildPosting({ type: 'INCOME', amount: 125000 });
    expect(assertBalanced(entries)).toEqual({ debit: 125000, credit: 125000 });
  });

  test('ledger từ chối bút toán lệch', () => {
    expect(() => assertBalanced([
      { side: 'DEBIT', amount_minor: 100 },
      { side: 'CREDIT', amount_minor: 99 }
    ])).toThrow(/không cân bằng/);
  });

  test('posting key trùng là no-op', async () => {
    const existing = { _id: 'tx-1', posting_key: 'payment:1' };
    const Transaction = { findOne: jest.fn(async () => existing), create: jest.fn() };
    const Entry = { insertMany: jest.fn() };
    const result = await postTransaction({
      type: 'INCOME',
      source_type: 'PAYMENT',
      source_id: '1',
      posting_key: 'payment:1',
      amount: 100
    }, { LedgerTransaction: Transaction, LedgerEntry: Entry });
    expect(result.duplicated).toBe(true);
    expect(Transaction.create).not.toHaveBeenCalled();
    expect(Entry.insertMany).not.toHaveBeenCalled();
  });

  test('backfill chạy lần hai là no-op', async () => {
    let existing = null;
    const Transaction = {
      findOne: jest.fn(async () => existing),
      create: jest.fn(async (doc) => {
        existing = { _id: 'tx-backfill', occurred_at: new Date(), ...doc };
        return existing;
      }),
      deleteOne: jest.fn()
    };
    const Entry = { insertMany: jest.fn(async () => []) };
    const input = {
      type: 'INCOME',
      source_type: 'PAYMENT',
      source_id: 'old-1',
      posting_key: 'payment:old-1',
      amount: 100
    };
    const first = await postTransaction(input, { LedgerTransaction: Transaction, LedgerEntry: Entry });
    const second = await postTransaction(input, { LedgerTransaction: Transaction, LedgerEntry: Entry });
    expect(first.duplicated).toBe(false);
    expect(second.duplicated).toBe(true);
    expect(Entry.insertMany).toHaveBeenCalledTimes(1);
  });

  test('lỗi ghi giao dịch sau debit được bù đúng một lần', async () => {
    const compensate = jest.fn(async () => {});
    await expect(executeDebitWithCompensation({
      debit: async () => ({ _id: 'wallet-1', balance: 900 }),
      record: async () => { throw new Error('write failed'); },
      compensate
    })).rejects.toThrow('write failed');
    expect(compensate).toHaveBeenCalledTimes(1);
  });

  test('debit thất bại không gọi compensation', async () => {
    const compensate = jest.fn(async () => {});
    await expect(executeDebitWithCompensation({
      debit: async () => { throw new Error('insufficient'); },
      record: jest.fn(),
      compensate
    })).rejects.toThrow('insufficient');
    expect(compensate).not.toHaveBeenCalled();
  });

  test('refund và expense reversal đảo đúng chiều', () => {
    const refund = buildPosting({ type: 'REFUND', amount: 50 });
    const reversal = buildPosting({ type: 'REVERSAL', amount: 50 });
    expect(refund).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_code: ACCOUNTS.REFUNDS, side: 'DEBIT' }),
      expect.objectContaining({ account_code: ACCOUNTS.CASH, side: 'CREDIT' })
    ]));
    expect(reversal).toEqual(expect.arrayContaining([
      expect.objectContaining({ account_code: ACCOUNTS.CASH, side: 'DEBIT' }),
      expect.objectContaining({ account_code: ACCOUNTS.EXPENSE, side: 'CREDIT' })
    ]));
  });

  test('cash transfer cân bằng và idempotent qua posting service', async () => {
    const created = { _id: 'tx-transfer', occurred_at: new Date() };
    const Transaction = {
      findOne: jest.fn(async () => null),
      create: jest.fn(async () => created),
      deleteOne: jest.fn()
    };
    const Entry = { insertMany: jest.fn(async (rows) => rows) };
    await postTransfer({
      source_id: 'bank-1',
      posting_key: 'transfer:bank-1',
      amount: 500,
      from_account: ACCOUNTS.CASH,
      to_account: ACCOUNTS.PROVIDER_CLEARING,
      deps: { LedgerTransaction: Transaction, LedgerEntry: Entry }
    });
    const rows = Entry.insertMany.mock.calls[0][0];
    expect(assertBalanced(rows)).toEqual({ debit: 500, credit: 500 });
  });

  test('đối soát đủ sáu nhóm', () => {
    const internal = [
      { provider_ref: 'ok', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'missing-provider', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'amount', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'status', amount_minor: 100, status: 'FAILED' },
      { provider_ref: 'dup', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'dup', amount_minor: 100, status: 'SUCCESS' }
    ];
    const provider = [
      { provider_ref: 'ok', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'missing-internal', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'amount', amount_minor: 200, status: 'SUCCESS' },
      { provider_ref: 'status', amount_minor: 100, status: 'SUCCESS' },
      { provider_ref: 'dup', amount_minor: 100, status: 'SUCCESS' }
    ];
    const groups = new Set(classifyReconciliation(internal, provider).map((item) => item.classification));
    expect(groups).toEqual(new Set([
      'MATCHED', 'MISSING_PROVIDER', 'MISSING_INTERNAL', 'AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'DUPLICATE'
    ]));
  });

  test('receipt chụp line/tax/customer/seller snapshot', () => {
    const snapshot = buildReceiptSnapshot({
      _id: 'invoice-1',
      invoice_number: 'INV-1',
      plan: 'PRO',
      amount: 100,
      tax_amount: 10,
      discount_amount: 5,
      currency: 'VND',
      line_items_snapshot: [{ description: 'PRO', quantity: 1, unit_amount: 100 }],
      tax_snapshot: { rate: 10 },
      customer_snapshot: { name: 'Customer' },
      seller_snapshot: { name: 'Seller' }
    }, { provider: 'VNPAY', externalRef: 'TX1' });
    expect(snapshot).toMatchObject({
      total: 105,
      tax: { rate: 10 },
      customer: { name: 'Customer' },
      seller: { name: 'Seller' },
      provider_ref: 'TX1'
    });
  });

  test('export giữ đúng headers và quoted values', () => {
    const csv = toCsv(['paid_at', 'amount', 'note'], [
      { paid_at: '2026-07-21', amount: 100, note: 'a,b' }
    ]);
    expect(parseCsv(csv)).toEqual([
      ['paid_at', 'amount', 'note'],
      ['2026-07-21', '100', 'a,b']
    ]);
  });
});
