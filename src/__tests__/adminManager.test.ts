/**
 * Simple AdminManager Test Suite
 * 
 * Tests for basic admin utility functions that don't require complex mocking.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { clearAllMocks, createMock } from './_helpers/mockLifecycle';
import { isValidAdmin } from '../utils/adminManager.js';

mock.module('../config/env.js', () => ({
    isAdminUser: createMock()
}));

import { isAdminUser } from '../config/env.js';

describe('adminManager utilities', () => {
    beforeEach(() => {
        clearAllMocks();
    });

    afterAll(() => {
        mock.restore();
    });

    describe('isValidAdmin', () => {
        it('should return true for valid admin users', () => {
            (isAdminUser as any).mockReturnValue(true);

            const result = isValidAdmin(12345);

            expect(result).toBe(true);
            expect(isAdminUser).toHaveBeenCalledWith(12345);
        });

        it('should return false for non-admin users', () => {
            (isAdminUser as any).mockReturnValue(false);

            const result = isValidAdmin(67890);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(67890);
        });

        it('should handle zero user ID', () => {
            (isAdminUser as any).mockReturnValue(false);

            const result = isValidAdmin(0);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(0);
        });

        it('should handle negative user ID', () => {
            (isAdminUser as any).mockReturnValue(false);

            const result = isValidAdmin(-1);

            expect(result).toBe(false);
            expect(isAdminUser).toHaveBeenCalledWith(-1);
        });

        it('should handle very large user ID', () => {
            const largeId = 999999999999;
            (isAdminUser as any).mockReturnValue(true);

            const result = isValidAdmin(largeId);

            expect(result).toBe(true);
            expect(isAdminUser).toHaveBeenCalledWith(largeId);
        });
    });
});
