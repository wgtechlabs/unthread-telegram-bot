/**
 * Early LogEngine Configuration
 * 
 * Configures LogEngine format before any other modules are imported
 * to ensure consistent timestamp formatting across all startup logs.
 * 
 * @author Waren Gonzaga, WG Technology Labs
 * @version 1.0.0-rc2
 * @since 2025
 */
import { LogEngine } from '@wgtechlabs/log-engine';

// Configure LogEngine to use local timezone only BEFORE any other imports
LogEngine.configure({
    format: {
        includeIsoTimestamp: false,
        includeLocalTime: true
    }
});

export { LogEngine };
