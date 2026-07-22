// Phase 8 — Publish permit / contract key (opt-in via env)
const crypto = require('crypto');
const organizations = require('../repositories/mapLifecycleRepository');

function isPermitRequired() {
  return process.env.PUBLISH_PERMIT_REQUIRED === 'true';
}

/**
 * @param {object} org — Organization document or lean
 * @returns {{ ok: true } | { ok: false, code, message }}
 */
function assertOrgCanPublish(org) {
  if (!isPermitRequired()) {
    return { ok: true };
  }
  if (!org) {
    return {
      ok: false,
      code: 'PUBLISH_PERMIT_REQUIRED',
      message: 'Thiếu thông tin tổ chức để kiểm tra permit xuất bản.'
    };
  }

  const key = String(org.publish_permit_key || '').trim();
  if (!key) {
    return {
      ok: false,
      code: 'PUBLISH_PERMIT_REQUIRED',
      message: 'Tổ chức chưa được cấp quyền xuất bản (publish permit). Liên hệ Super Admin.'
    };
  }

  if (org.publish_permit_expires_at) {
    const exp = new Date(org.publish_permit_expires_at).getTime();
    if (Number.isFinite(exp) && exp <= Date.now()) {
      return {
        ok: false,
        code: 'PUBLISH_PERMIT_REQUIRED',
        message: 'Publish permit đã hết hạn. Liên hệ Super Admin để gia hạn.'
      };
    }
  }

  return { ok: true };
}

async function setPermit(orgId, { key, expiresAt } = {}) {
  const org = await organizations.findOrganization(orgId);
  if (!org) {
    const err = new Error('Không tìm thấy tổ chức.');
    err.status = 404;
    throw err;
  }

  const permitKey = key && String(key).trim()
    ? String(key).trim()
    : crypto.randomBytes(16).toString('hex');

  return organizations.updatePublishPermit(orgId, {
    publish_permit_key: permitKey,
    publish_permit_expires_at: expiresAt ? new Date(expiresAt) : null
  });
}

async function clearPermit(orgId) {
  const org = await organizations.findOrganization(orgId);
  if (!org) {
    const err = new Error('Không tìm thấy tổ chức.');
    err.status = 404;
    throw err;
  }
  return organizations.updatePublishPermit(orgId, {
    publish_permit_key: '',
    publish_permit_expires_at: null
  });
}

module.exports = {
  isPermitRequired,
  assertOrgCanPublish,
  setPermit,
  clearPermit
};
