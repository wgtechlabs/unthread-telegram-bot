/**
 * Simple AdminManager Test Suite
 * 
 * Tests for basic admin utility functions that don't require complex mocking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidAdmin } from '../utils/adminManager.js';

// Mock dependencies
vi.mock('../config/env.js', () => ({
    isAdminUser: vi.fn()
}));

vi.mock('@wgtechlabs/log-engine', () => ({
    LogEngine: {
        error: vi.fn()
    }
}));

import { isAdminUser } from '../config/env.js';

describe('adminManager utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isValidAdmin', () => {
        it('should return true for valid admin users', () => {
            vi.mocked(isAdminUser).mockReturnValue(true);

            const result = isValidAdmin(12345);

            expect(result).toBe(true);
            expect(isAdminUser).toHaveBeenCalledWith(12345);
        });

        it('should return false for non-admin users', () => {
            vi.mocked(isAdminUser).mockReturnValue(false);

            const result = isValidAdmin(67890);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(67890);
        });

        it('should handle zero user ID', () => {
            vi.mocked(isAdminUser).mockReturnValue(false);

            const result = isValidAdmin(0);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(0);
        });

        it('should handle negative user ID', () => {
            vi.mocked(isAdminUser).mockReturnValue(false);

            const result = isValidAdmin(-1);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(-1);
        });

        it('should handle very large user ID', () => {
            const largeId = 999999999999;
            vi.mocked(isAdminUser).mockReturnValue(true);

            const result = isValidAdmin(largeId);

            expect(result).toBe(true);
            expect(isAdminUser).toHaveBeenCalledWith(largeId);
        });
    });
});