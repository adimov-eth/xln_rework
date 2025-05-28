import { FEATURES, LOG_LEVEL, IS_DEVELOPMENT } from './constants';

export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: number;
    component?: string;
    machineId?: string;
    data?: any;
    error?: Error;
}

export interface LoggerConfig {
    level: LogLevel;
    enableConsole: boolean;
    enableFile: boolean;
    enableMetrics: boolean;
    filePath?: string;
    maxFileSize?: number;
    component?: string;
}

export class Logger {
    private config: LoggerConfig;
    private logBuffer: LogEntry[] = [];
    private maxBufferSize = 1000;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            level: this.parseLogLevel(LOG_LEVEL),
            enableConsole: true,
            enableFile: !IS_DEVELOPMENT,
            enableMetrics: FEATURES.ENABLE_METRICS,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            ...config
        };
    }

    private parseLogLevel(level: string): LogLevel {
        switch (level.toLowerCase()) {
            case 'error':
                return LogLevel.ERROR;
            case 'warn':
                return LogLevel.WARN;
            case 'info':
                return LogLevel.INFO;
            case 'debug':
                return LogLevel.DEBUG;
            case 'trace':
                return LogLevel.TRACE;
            default:
                return LogLevel.INFO;
        }
    }

    error(message: string, error?: Error, data?: any): void {
        this.log(LogLevel.ERROR, message, { error, data });
    }

    warn(message: string, data?: any): void {
        this.log(LogLevel.WARN, message, { data });
    }

    info(message: string, data?: any): void {
        this.log(LogLevel.INFO, message, { data });
    }

    debug(message: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, { data });
    }

    trace(message: string, data?: any): void {
        this.log(LogLevel.TRACE, message, { data });
    }

    performance(operation: string, duration: number, data?: any): void {
        this.log(LogLevel.INFO, `Performance: ${operation} took ${duration}ms`, {
            data: { ...data, duration, operation, type: 'performance' }
        });
    }

    machine(machineId: string, level: LogLevel, message: string, data?: any): void {
        this.log(level, message, { data, machineId });
    }

    transaction(txHash: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, `Transaction ${txHash}: ${message}`, {
            data: { ...data, txHash, type: 'transaction' }
        });
    }

    block(blockNumber: number, message: string, data?: any): void {
        this.log(LogLevel.INFO, `Block ${blockNumber}: ${message}`, {
            data: { ...data, blockNumber, type: 'block' }
        });
    }

    channel(channelId: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, `Channel ${channelId}: ${message}`, {
            data: { ...data, channelId, type: 'channel' }
        });
    }

    private log(
        level: LogLevel,
        message: string,
        options: {
            error?: Error;
            data?: any;
            machineId?: string;
        } = {}
    ): void {
        if (level > this.config.level) {
            return;
        }

        const entry: LogEntry = {
            level,
            message,
            timestamp: Date.now(),
            component: this.config.component,
            machineId: options.machineId,
            data: options.data,
            error: options.error
        };

        // Add to buffer
        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }

        // Console output
        if (this.config.enableConsole) {
            this.logToConsole(entry);
        }

        // File output
        if (this.config.enableFile && this.config.filePath) {
            this.logToFile(entry);
        }

        // Metrics
        if (this.config.enableMetrics) {
            this.recordMetric(entry);
        }
    }

    private logToConsole(entry: LogEntry): void {
        const timestamp = new Date(entry.timestamp).toISOString();
        const component = entry.component ? `[${entry.component}]` : '';
        const machineId = entry.machineId ? `{${entry.machineId.substring(0, 8)}}` : '';
        const level = LogLevel[entry.level].padEnd(5);

        let message = `${timestamp} ${level} ${component}${machineId} ${entry.message}`;

        if (entry.data && FEATURES.ENABLE_DEBUG_LOGS) {
            message += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
        }

        if (entry.error) {
            message += `\n  Error: ${entry.error.message}`;
            if (entry.error.stack && FEATURES.ENABLE_DEBUG_LOGS) {
                message += `\n  Stack: ${entry.error.stack}`;
            }
        }

        switch (entry.level) {
            case LogLevel.ERROR:
                console.error(message);
                break;
            case LogLevel.WARN:
                console.warn(message);
                break;
            case LogLevel.DEBUG:
            case LogLevel.TRACE:
                if (FEATURES.ENABLE_DEBUG_LOGS) {
                    console.debug(message);
                }
                break;
            default:
                console.log(message);
        }
    }

    private logToFile(entry: LogEntry): void {
        // In a real implementation, this would write to a file
        // For now, we'll skip the actual file writing
        if (IS_DEVELOPMENT) {
            return;
        }

        try {
            const logLine =
                JSON.stringify({
                    ...entry,
                    error: entry.error
                        ? {
                              message: entry.error.message,
                              stack: entry.error.stack,
                              name: entry.error.name
                          }
                        : undefined
                }) + '\n';

            // File writing would go here
            // fs.appendFileSync(this.config.filePath!, logLine);
        } catch (error) {
            console.error('Failed to write log to file:', error);
        }
    }

    private recordMetric(entry: LogEntry): void {
        // Record metrics for monitoring
        // This would integrate with a metrics system
        if (entry.data?.type === 'performance') {
            // Record performance metrics
        }

        if (entry.level === LogLevel.ERROR) {
            // Increment error counter
        }
    }

    getRecentLogs(count: number = 100): LogEntry[] {
        return this.logBuffer.slice(-count);
    }

    getLogsByLevel(level: LogLevel, count: number = 100): LogEntry[] {
        return this.logBuffer.filter((entry) => entry.level === level).slice(-count);
    }

    getLogsByComponent(component: string, count: number = 100): LogEntry[] {
        return this.logBuffer.filter((entry) => entry.component === component).slice(-count);
    }

    createChildLogger(component: string): Logger {
        return new Logger({
            ...this.config,
            component
        });
    }

    flush(): void {
        // Flush any pending logs
        // In a real implementation, this would ensure all logs are written
    }

    setLevel(level: LogLevel): void {
        this.config.level = level;
    }

    getLevel(): LogLevel {
        return this.config.level;
    }

    // Convenience method for timing operations
    async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this.performance(operation, duration, { success: true });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.performance(operation, duration, { success: false });
            this.error(`Operation ${operation} failed`, error as Error);
            throw error;
        }
    }

    // Sync version of time
    timeSync<T>(operation: string, fn: () => T): T {
        const start = Date.now();
        try {
            const result = fn();
            const duration = Date.now() - start;
            this.performance(operation, duration, { success: true });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            this.performance(operation, duration, { success: false });
            this.error(`Operation ${operation} failed`, error as Error);
            throw error;
        }
    }
}

// Global logger instance
export const logger = new Logger();

// Specialized loggers
export const serverLogger = logger.createChildLogger('server');
export const signerLogger = logger.createChildLogger('signer');
export const entityLogger = logger.createChildLogger('entity');
export const channelLogger = logger.createChildLogger('channel');
export const networkLogger = logger.createChildLogger('network');
export const storageLogger = logger.createChildLogger('storage');
export const apiLogger = logger.createChildLogger('api');

// Utility functions
export function createMachineLogger(machineType: string, machineId: string): Logger {
    const logger = new Logger({
        component: machineType,
        level: LogLevel.DEBUG
    });

    // Add machine ID to all logs from this logger
    const originalLog = (logger as any).log.bind(logger);
    (logger as any).log = function (level: LogLevel, message: string, options: any = {}) {
        return originalLog(level, message, {
            ...options,
            machineId: machineId
        });
    };

    return logger;
}

export function logExecutionTime(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
        const start = Date.now();
        const className = this.constructor.name;

        try {
            const result = await originalMethod.apply(this, args);
            const duration = Date.now() - start;
            logger.performance(`${className}.${propertyKey}`, duration);
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            logger.performance(`${className}.${propertyKey}`, duration, { error: true });
            throw error;
        }
    };

    return descriptor;
}
