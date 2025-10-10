/**
 * Unit tests for commands/utils/errorHandler.ts
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getErrorDetails,
  logError,
  createUserErrorMessage,
  ErrorCategory,
  ErrorSeverity,
  ERROR_CODES,
  type ErrorDetails
} from '../commands/utils/errorHandler.js';

// Mock LogEngine
vi.mock('@wgtechlabs/log-engine', () => ({
  LogEngine: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import { LogEngine } from '@wgtechlabs/log-engine';

describe('errorHandler utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ErrorCategory enum', () => {
    it('should have all expected categories', () => {
      expect(ErrorCategory.SYSTEM).toBe('SYSTEM');
      expect(ErrorCategory.OPERATIONAL).toBe('OPERATIONAL');
      expect(ErrorCategory.VALIDATION).toBe('VALIDATION');
      expect(ErrorCategory.NETWORK).toBe('NETWORK');
      expect(ErrorCategory.AUTHENTICATION).toBe('AUTH');
      expect(ErrorCategory.BUSINESS).toBe('BUSINESS');
      expect(ErrorCategory.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('ErrorSeverity enum', () => {
    it('should have all expected severity levels', () => {
      expect(ErrorSeverity.CRITICAL).toBe('CRITICAL');
      expect(ErrorSeverity.HIGH).toBe('HIGH');
      expect(ErrorSeverity.MEDIUM).toBe('MEDIUM');
      expect(ErrorSeverity.LOW).toBe('LOW');
      expect(ErrorSeverity.INFO).toBe('INFO');
    });
  });

  describe('ERROR_CODES object', () => {
    it('should be defined and contain error codes', () => {
      expect(ERROR_CODES).toBeDefined();
      expect(typeof ERROR_CODES).toBe('object');
    });
  });

  describe('getErrorDetails', () => {
    it('should handle Error instances with basic properties', () => {
      const error = new Error('Test error message');
      const details = getErrorDetails(error);

      expect(details.message).toBe('Test error message');
      expect(details.name).toBe('Error');
      expect(details.timestamp).toBeDefined();
      expect(new Date(details.timestamp)).toBeInstanceOf(Date);
      expect(details.stack).toBeDefined();
      expect(details.errorCategory).toBeDefined();
      expect(details.severity).toBeDefined();
    });

    it('should handle Error instances with additional properties', () => {
      const error = new Error('Test error') as any;
      error.code = 'TEST_CODE';
      error.statusCode = 500;
      error.cause = 'Root cause';
      error.isOperational = true;

      const details = getErrorDetails(error);

      expect(details.message).toBe('Test error');
      expect(details.code).toBe('TEST_CODE');
      expect(details.statusCode).toBe(500);
      expect(details.cause).toBe('Root cause');
      expect(details.isOperational).toBe(true);
    });

    it('should handle string errors', () => {
      const errorString = 'This is a string error';
      const details = getErrorDetails(errorString);

      expect(details.message).toBe(errorString);
      expect(details.name).toBe('StringError');
      expect(details.timestamp).toBeDefined();
      expect(details.errorCategory).toBeDefined();
      expect(details.severity).toBeDefined();
    });

    it('should handle null errors', () => {
      const details = getErrorDetails(null);

      expect(details.message).toBe('Null error occurred');
      expect(details.name).toBe('NullError');
      expect(details.timestamp).toBeDefined();
      expect(details.errorCategory).toBe(ErrorCategory.SYSTEM);
      expect(details.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should handle undefined errors', () => {
      const details = getErrorDetails(undefined);

      expect(details.message).toBe('Undefined error occurred');
      expect(details.name).toBe('UndefinedError');
      expect(details.timestamp).toBeDefined();
      expect(details.errorCategory).toBe(ErrorCategory.SYSTEM);
      expect(details.severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should handle object errors without message', () => {
      const error = { someProperty: 'value' };
      const details = getErrorDetails(error);

      expect(details.message).toContain('Unknown error type: object');
      expect(details.name).toBe('UnknownError');
      expect(details.timestamp).toBeDefined();
      expect(details.errorCategory).toBe(ErrorCategory.UNKNOWN);
      expect(details.severity).toBe(ErrorSeverity.LOW);
    });

    it('should handle object errors with message property', () => {
      const error = { message: 'Object error message' };
      const details = getErrorDetails(error);

      expect(details.message).toBe('Object error message');
      expect(details.name).toBe('UnknownObjectError');
      expect(details.timestamp).toBeDefined();
    });

    it('should handle errors without stack trace', () => {
      const error = new Error('No stack error');
      delete error.stack;

      const details = getErrorDetails(error);

      expect(details.message).toBe('No stack error');
      expect(details.stack).toBeUndefined();
    });
  });

  describe('logError', () => {
    it('should log system errors at error level', () => {
      const error = new Error('System error');
      const context = 'test-context';
      
      const details = logError(error, context);

      expect(details.message).toBe('System error');
      expect(LogEngine.error).toHaveBeenCalled();
      const logCall = vi.mocked(LogEngine.error).mock.calls[0];
      expect(logCall[0]).toContain(context);
    });

    it('should log with additional data', () => {
      const error = new Error('Test error');
      const context = 'test-context';
      const additionalData = { userId: 123, action: 'test' };
      
      logError(error, context, additionalData);

      expect(LogEngine.error).toHaveBeenCalled();
      const logCall = vi.mocked(LogEngine.error).mock.calls[0];
      const logData = logCall[1];
      expect(logData.userId).toBe(123);
      expect(logData.action).toBe('test');
    });

    it('should handle validation errors with warn level', () => {
      const error = new Error('Validation error') as any;
      error.statusCode = 400;
      const context = 'validation-context';
      
      logError(error, context);

      expect(LogEngine.warn).toHaveBeenCalled();
    });

    it('should handle 429 rate limit errors', () => {
      const error = new Error('Rate limited') as any;
      error.statusCode = 429;
      const context = 'rate-limit-context';
      
      logError(error, context);

      // Rate limit errors might be logged at different levels depending on classification
      const errorCalled = vi.mocked(LogEngine.error).mock.calls.length > 0;
      const warnCalled = vi.mocked(LogEngine.warn).mock.calls.length > 0;
      expect(errorCalled || warnCalled).toBe(true);
    });

    it('should return error details', () => {
      const error = new Error('Test error');
      const context = 'test-context';
      
      const result = logError(error, context);

      expect(result).toBeDefined();
      expect(result.message).toBe('Test error');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('createUserErrorMessage', () => {
    it('should return rate limit message for 429 status', () => {
      const error = new Error('Rate limited') as any;
      error.statusCode = 429;

      const message = createUserErrorMessage(error);

      expect(message).toBe("⏳ Please wait a moment before trying again.");
    });

    it('should return not found message for 404 status', () => {
      const error = new Error('Not found') as any;
      error.statusCode = 404;

      const message = createUserErrorMessage(error);

      expect(message).toBe("❌ The requested resource was not found.");
    });

    it('should return server error message for 500+ status codes', () => {
      const error = new Error('Server error') as any;
      error.statusCode = 500;

      const message = createUserErrorMessage(error);

      expect(message).toBe("🔧 We're experiencing technical difficulties. Please try again later.");
    });

    it('should return validation error message for ValidationError', () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';

      const message = createUserErrorMessage(error);

      expect(message).toBe("❌ Invalid input: Invalid input");
    });

    it('should return operational error message for operational errors', () => {
      const error = new Error('Business logic error') as any;
      error.isOperational = true;

      const message = createUserErrorMessage(error);

      expect(message).toBe("❌ Business logic error");
    });

    it('should return generic message for unknown errors', () => {
      const error = new Error('Unknown error');

      const message = createUserErrorMessage(error);

      expect(message).toBe("❌ An unexpected error occurred. Please try again.");
    });

    it('should handle string errors', () => {
      const error = 'String error message';

      const message = createUserErrorMessage(error);

      expect(message).toBe("❌ An unexpected error occurred. Please try again.");
    });

    it('should handle null/undefined errors', () => {
      const message1 = createUserErrorMessage(null);
      const message2 = createUserErrorMessage(undefined);

      expect(message1).toBe("❌ An unexpected error occurred. Please try again.");
      expect(message2).toBe("❌ An unexpected error occurred. Please try again.");
    });

    it('should handle server errors with different 5xx codes', () => {
      const error502 = new Error('Bad Gateway') as any;
      error502.statusCode = 502;
      
      const error503 = new Error('Service Unavailable') as any;
      error503.statusCode = 503;

      expect(createUserErrorMessage(error502)).toBe("🔧 We're experiencing technical difficulties. Please try again later.");
      expect(createUserErrorMessage(error503)).toBe("🔧 We're experiencing technical difficulties. Please try again later.");
    });
  });
});