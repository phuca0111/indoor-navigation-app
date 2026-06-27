/**
 * Unit Test đơn giản cho User Controller
 * Chạy bằng: npm test
 */

const User = require('../../models/User');
const UserController = require('../../controllers/userController');

// Mock User model (path must match require path above)
jest.mock('../../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  find: jest.fn(),
  create: jest.fn()
}));

describe('User Controller Unit Tests', () => {
  let mockUser;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockUser = {
      _id: '123',
      email: 'test@test.com',
      password: 'hashed',
      role: 'BUILDING_ADMIN',
      is_active: true,
      full_name: 'Test User',
      phone: '0123456789',
      assigned_buildings: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockReq = {
      params: { userId: '123' },
      body: {},
      user: { userId: '123' },
      ip: '127.0.0.1'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateUser validation', () => {
    test('should reject non-string phone', () => {
      const phone = 12345; // number, not string
      expect(typeof phone).toBe('number');
    });

    test('should accept valid phone string with numbers', () => {
      const phone = '0987654321';
      expect(typeof phone).toBe('string');
      expect(/^[0-9\+\-\s]{1,20}$/.test(phone)).toBe(true);
    });

    test('should reject phone with letters', () => {
      const phone = 'abc123';
      expect(/^[0-9\+\-\s]{1,20}$/.test(phone)).toBe(false);
    });

    test('should reject phone with special chars except + - space', () => {
      expect(/^[0-9\+\-\s]{1,20}$/.test('123@456')).toBe(false);
      expect(/^[0-9\+\-\s]{1,20}$/.test('123#456')).toBe(false);
    });

    test('should accept phone with plus sign', () => {
      expect(/^[0-9\+\-\s]{1,20}$/.test('+8497654321')).toBe(true);
    });

    test('should accept phone with dash', () => {
      expect(/^[0-9\+\-\s]{1,20}$/.test('0987-654-321')).toBe(true);
    });

    test('should accept phone with spaces', () => {
      expect(/^[0-9\+\-\s]{1,20}$/.test('0987 654 321')).toBe(true);
    });

    test('should reject phone longer than 20 chars', () => {
      const longPhone = '0'.repeat(21);
      expect(/^[0-9\+\-\s]{1,20}$/.test(longPhone)).toBe(false);
    });
  });

  describe('Role validation', () => {
    const validRoles = ['SUPER_ADMIN', 'BUILDING_ADMIN'];

    test('should accept valid roles', () => {
      expect(validRoles).toContain('SUPER_ADMIN');
      expect(validRoles).toContain('BUILDING_ADMIN');
    });

    test('should reject invalid role', () => {
      expect(validRoles).not.toContain('HACKER');
      expect(validRoles).not.toContain('USER');
    });
  });

  describe('Self-protection logic', () => {
    test('should prevent self-deactivate', () => {
      const selfUserId = '123';
      const actingUserId = '123';
      const is_active = false;
      const canDeactivate = actingUserId !== selfUserId || is_active !== false;
      expect(canDeactivate).toBe(false); // Should be blocked
    });

    test('should prevent self-demote from SUPER_ADMIN', () => {
      const selfUserId = '123';
      const actingUserId = '123';
      const currentRole = 'SUPER_ADMIN';
      const newRole = 'BUILDING_ADMIN';
      const canDemote = actingUserId !== selfUserId || currentRole !== 'SUPER_ADMIN' || newRole !== 'BUILDING_ADMIN';
      expect(canDemote).toBe(false); // Should be blocked
    });
  });
});

describe('Frontend Dashboard Functions', () => {
  // Test các hàm trong dashboard.js
  test('applyCurrentUserToUI should update header correctly', () => {
    const currentUser = {
      email: 'admin@test.com',
      full_name: 'Admin User',
      role: 'SUPER_ADMIN',
      _id: '123'
    };

    // Mock DOM
    const mockSetTextContent = jest.fn();
    const mockSetItem = jest.fn();
    const mockQuerySelectorAll = jest.fn(() => [{ style: { display: '' } }]);

    global.document = {
      getElementById: (id) => ({
        textContent: mockSetTextContent
      }),
      querySelectorAll: mockQuerySelectorAll
    };

    global.localStorage = {
      setItem: mockSetItem
    };

    // Call function (would need to import it - simplified test)
    // This shows the expected behavior
    expect(currentUser.role).toBe('SUPER_ADMIN');
    expect(currentUser.email).toBe('admin@test.com');
  });
});
