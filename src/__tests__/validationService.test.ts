/**
 * ValidationService Test Suite
 * 
 * Tests for the validation service types and interfaces.
 */

import { describe, it, expect } from 'vitest';
import type { ValidationCheck, ValidationResult } from '../services/validationService.js';

describe('ValidationService types', () => {
    describe('ValidationCheck interface', () => {
        it('should create a validation check with required properties', () => {
            const check: ValidationCheck = {
                name: 'Test Check',
                passed: true,
                details: 'Test details'
            };

            expect(check.name).toBe('Test Check');
            expect(check.passed).toBe(true);
            expect(check.details).toBe('Test details');
            expect(check.warning).toBeUndefined();
        });

        it('should create a validation check with warning', () => {
            const check: ValidationCheck = {
                name: 'Warning Check',
                passed: false,
                details: 'Warning details',
                warning: true
            };

            expect(check.name).toBe('Warning Check');
            expect(check.passed).toBe(false);
            expect(check.details).toBe('Warning details');
            expect(check.warning).toBe(true);
        });

        it('should allow boolean values for passed property', () => {
            const passedCheck: ValidationCheck = {
                name: 'Passed',
                passed: true,
                details: 'Success'
            };

            const failedCheck: ValidationCheck = {
                name: 'Failed',
                passed: false,
                details: 'Failure'
            };

            expect(passedCheck.passed).toBe(true);
            expect(failedCheck.passed).toBe(false);
        });
    });

    describe('ValidationResult interface', () => {
        it('should create a validation result with all properties', () => {
            const checks: ValidationCheck[] = [
                {
                    name: 'Check 1',
                    passed: true,
                    details: 'Success'
                },
                {
                    name: 'Check 2',
                    passed: false,
                    details: 'Failed'
                }
            ];

            const result: ValidationResult = {
                checks,
                allPassed: false,
                message: 'Validation completed with issues'
            };

            expect(result.checks).toHaveLength(2);
            expect(result.allPassed).toBe(false);
            expect(result.message).toBe('Validation completed with issues');
        });

        it('should handle empty checks array', () => {
            const result: ValidationResult = {
                checks: [],
                allPassed: true,
                message: 'No checks performed'
            };

            expect(result.checks).toHaveLength(0);
            expect(result.allPassed).toBe(true);
            expect(result.message).toBe('No checks performed');
        });

        it('should handle all passed scenario', () => {
            const checks: ValidationCheck[] = [
                {
                    name: 'Check 1',
                    passed: true,
                    details: 'Success'
                },
                {
                    name: 'Check 2',
                    passed: true,
                    details: 'Success'
                }
            ];

            const result: ValidationResult = {
                checks,
                allPassed: true,
                message: 'All validations passed'
            };

            expect(result.checks.every(check => check.passed)).toBe(true);
            expect(result.allPassed).toBe(true);
            expect(result.message).toBe('All validations passed');
        });

        it('should handle mixed validation results', () => {
            const checks: ValidationCheck[] = [
                {
                    name: 'Required Check',
                    passed: true,
                    details: 'Success'
                },
                {
                    name: 'Optional Check',
                    passed: false,
                    details: 'Failed but not critical',
                    warning: true
                },
                {
                    name: 'Critical Check',
                    passed: false,
                    details: 'Critical failure'
                }
            ];

            const result: ValidationResult = {
                checks,
                allPassed: false,
                message: 'Validation failed with critical issues'
            };

            expect(result.checks).toHaveLength(3);
            expect(result.checks.filter(c => c.passed)).toHaveLength(1);
            expect(result.checks.filter(c => c.warning)).toHaveLength(1);
            expect(result.allPassed).toBe(false);
        });
    });

    describe('validation check scenarios', () => {
        it('should represent bot admin status check', () => {
            const adminCheck: ValidationCheck = {
                name: 'Bot Admin Status',
                passed: true,
                details: 'Bot has administrator privileges in the group'
            };

            expect(adminCheck.name).toBe('Bot Admin Status');
            expect(adminCheck.passed).toBe(true);
            expect(adminCheck.details).toContain('administrator privileges');
        });

        it('should represent message sending capability check', () => {
            const messageCheck: ValidationCheck = {
                name: 'Message Sending',
                passed: false,
                details: 'Bot cannot send messages to the group',
                warning: false
            };

            expect(messageCheck.name).toBe('Message Sending');
            expect(messageCheck.passed).toBe(false);
            expect(messageCheck.details).toContain('cannot send messages');
            expect(messageCheck.warning).toBe(false);
        });

        it('should represent permission check with warning', () => {
            const permissionCheck: ValidationCheck = {
                name: 'Delete Messages Permission',
                passed: false,
                details: 'Bot lacks delete messages permission but can still function',
                warning: true
            };

            expect(permissionCheck.name).toBe('Delete Messages Permission');
            expect(permissionCheck.passed).toBe(false);
            expect(permissionCheck.warning).toBe(true);
            expect(permissionCheck.details).toContain('can still function');
        });
    });
});