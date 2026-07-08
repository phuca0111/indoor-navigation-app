import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ToolRegistry = require('../core/tool-registry.js');

describe('Tool Registry', function () {
    beforeEach(function () {
        ToolRegistry.clear();
    });

    it('registerTool và get theo id', function () {
        ToolRegistry.registerTool({ id: 'door', name: 'Cửa', shortcut: 'd', category: 'draw' });
        var t = ToolRegistry.get('door');
        expect(t.name).toBe('Cửa');
        expect(t.shortcut).toBe('d');
    });

    it('getByShortcut không phân biệt hoa thường', function () {
        ToolRegistry.registerTool({ id: 'wall', name: 'Tường', shortcut: 'W' });
        expect(ToolRegistry.getByShortcut('w').id).toBe('wall');
    });

    it('getAll trả đủ tool đã đăng ký', function () {
        ToolRegistry.registerTool({ id: 'select', shortcut: 'v' });
        ToolRegistry.registerTool({ id: 'room', shortcut: 'r' });
        expect(ToolRegistry.getAll()).toHaveLength(2);
    });

    it('registerTool thiếu id throw', function () {
        expect(function () { ToolRegistry.registerTool({ name: 'X' }); }).toThrow();
    });
});
