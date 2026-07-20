// ContactRequest / ContactMessage — CRM mini cho Landing (SaaS inbox)
const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  action: { type: String, required: true, trim: true },
  detail: { type: String, default: '', trim: true, maxlength: 2000 },
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actor_name: { type: String, default: '', trim: true }
}, { _id: false });

const contactMessageSchema = new mongoose.Schema({
  // Giữ `name` để tương thích dữ liệu cũ; full_name là alias khi submit mới
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
  phone: { type: String, default: '', trim: true, maxlength: 40 },
  company: { type: String, default: '', trim: true, maxlength: 160 },
  website: { type: String, default: '', trim: true, maxlength: 300 },
  subject: { type: String, default: '', trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 4000 },
  source: { type: String, default: 'landing', trim: true },
  request_type: {
    type: String,
    enum: ['DEMO', 'CONSULT', 'PRICING', 'SUPPORT', 'BUG', 'OTHER'],
    default: 'OTHER',
    index: true
  },
  // Legacy field — map sang request_type khi đọc
  form_type: {
    type: String,
    enum: ['CONTACT', 'DEMO', 'REGISTER', 'NEWSLETTER'],
    default: 'CONTACT'
  },
  status: {
    type: String,
    enum: ['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED', 'SPAM', 'READ', 'ARCHIVED'],
    default: 'NEW',
    index: true
  },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  note: { type: String, default: '', trim: true, maxlength: 4000 },
  replied_at: { type: Date, default: null },
  closed_at: { type: Date, default: null },
  history: { type: [historySchema], default: [] },
  ip_address: { type: String, default: '' },
  user_agent: { type: String, default: '', maxlength: 400 }
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ request_type: 1, createdAt: -1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
