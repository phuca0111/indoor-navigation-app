const { rotateRefreshToken, hashToken } = require('../../services/refreshTokenService');

function fakeRefreshTokenModel(initial) {
  const records = initial.map((item, index) => ({ _id: String(index + 1), ...item }));
  return {
    records,
    async findOne(query) {
      return records.find((item) => item.token_hash === query.token_hash) || null;
    },
    async create(value) {
      const record = { _id: String(records.length + 1), is_revoked: false, ...value };
      records.push(record);
      return record;
    },
    async updateOne(query, update) {
      const record = records.find((item) =>
        item._id === query._id && (query.is_revoked === undefined || item.is_revoked === query.is_revoked)
      );
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set);
      return { modifiedCount: 1 };
    },
    async updateMany(query, update) {
      let modifiedCount = 0;
      records.forEach((record) => {
        if (record.family_id === query.family_id &&
            (query.is_revoked === undefined || record.is_revoked === query.is_revoked)) {
          Object.assign(record, update.$set);
          modifiedCount += 1;
        }
      });
      return { modifiedCount };
    }
  };
}

describe('refresh token rotation và reuse detection', () => {
  test('rotate token cũ và trả token mới cùng family', async () => {
    const raw = 'refresh-old';
    const model = fakeRefreshTokenModel([{
      user_id: 'user-1',
      token_hash: hashToken(raw),
      family_id: 'family-1',
      is_revoked: false,
      expires_at: new Date(Date.now() + 60000)
    }]);
    const result = await rotateRefreshToken({ RefreshToken: model, rawToken: raw, req: {} });
    expect(result.ok).toBe(true);
    expect(result.refreshToken).toBeTruthy();
    expect(model.records[0]).toMatchObject({ is_revoked: true, revoked_reason: 'ROTATED' });
    expect(model.records[1].family_id).toBe('family-1');
  });

  test('reuse token đã rotate thu hồi toàn family', async () => {
    const raw = 'refresh-old';
    const model = fakeRefreshTokenModel([{
      user_id: 'user-1',
      token_hash: hashToken(raw),
      family_id: 'family-1',
      is_revoked: true,
      revoked_reason: 'ROTATED',
      replaced_by_hash: 'next',
      expires_at: new Date(Date.now() + 60000)
    }, {
      user_id: 'user-1',
      token_hash: 'next',
      family_id: 'family-1',
      is_revoked: false,
      expires_at: new Date(Date.now() + 60000)
    }]);
    const result = await rotateRefreshToken({ RefreshToken: model, rawToken: raw, req: {} });
    expect(result).toMatchObject({ ok: false, code: 'REFRESH_REUSE_DETECTED' });
    expect(model.records.every((item) => item.is_revoked)).toBe(true);
    expect(model.records[1].revoked_reason).toBe('REUSE_DETECTED');
  });
});
