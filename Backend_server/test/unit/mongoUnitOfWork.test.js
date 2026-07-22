jest.mock('mongoose', () => ({
  startSession: jest.fn()
}));

const mongoose = require('mongoose');
const { withMongoUnitOfWork } = require('../../shared/persistence/mongoUnitOfWork');

describe('Mongo Unit of Work convention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Application Service sở hữu transaction và luôn đóng session', async () => {
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined)
    };
    mongoose.startSession.mockResolvedValue(session);
    const work = jest.fn().mockResolvedValue({ id: 'subscription-1' });

    const result = await withMongoUnitOfWork(work, {
      transactionOptions: { readConcern: { level: 'snapshot' } }
    });

    expect(result).toEqual({ id: 'subscription-1' });
    expect(work).toHaveBeenCalledWith(session);
    expect(session.withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      { readConcern: { level: 'snapshot' } }
    );
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test('session truyền từ caller không bị Unit of Work commit hoặc đóng', async () => {
    const session = {
      withTransaction: jest.fn(),
      endSession: jest.fn()
    };
    const work = jest.fn().mockResolvedValue('ok');

    await expect(withMongoUnitOfWork(work, { session })).resolves.toBe('ok');
    expect(mongoose.startSession).not.toHaveBeenCalled();
    expect(session.withTransaction).not.toHaveBeenCalled();
    expect(session.endSession).not.toHaveBeenCalled();
  });

  test('lỗi nghiệp vụ được truyền ra và owned session vẫn được đóng', async () => {
    const error = new Error('ledger invariant failed');
    const session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined)
    };
    mongoose.startSession.mockResolvedValue(session);

    await expect(withMongoUnitOfWork(async () => {
      throw error;
    })).rejects.toBe(error);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test('từ chối callback không hợp lệ trước khi mở session', async () => {
    await expect(withMongoUnitOfWork(null)).rejects.toThrow(
      'Unit of Work yêu cầu callback là một hàm.'
    );
    expect(mongoose.startSession).not.toHaveBeenCalled();
  });
});
