import {
    ServerConfig,
    TreeConfig,
    StorageConfig,
    ConsensusConfig,
    LimitsConfig
} from '../types/core';

export const defaultConfig: ServerConfig = {
    id: 'xln-server-001',
    host: 'localhost',
    port: 8080,
    storage: {
        path: './data',
        snapshotInterval: 100,
        cacheSize: '1GB'
    },
    consensus: {
        blockTime: 100, // 100ms
        proposalTimeout: 30000 // 30 seconds
    },
    limits: {
        maxChannels: 10000000,
        maxEntities: 100000,
        maxBlockSize: '1MB'
    }
};

export const defaultTreeConfig: TreeConfig = {
    bitWidth: 4,
    leafThreshold: 16
};

export class ConfigManager {
    private config: ServerConfig;

    constructor(config?: Partial<ServerConfig>) {
        this.config = this.mergeConfig(defaultConfig, config);
    }

    getConfig(): ServerConfig {
        return { ...this.config };
    }

    getStorageConfig(): StorageConfig {
        return { ...this.config.storage };
    }

    getConsensusConfig(): ConsensusConfig {
        return { ...this.config.consensus };
    }

    getLimitsConfig(): LimitsConfig {
        return { ...this.config.limits };
    }

    getTreeConfig(): TreeConfig {
        return defaultTreeConfig;
    }

    updateConfig(updates: Partial<ServerConfig>): void {
        this.config = this.mergeConfig(this.config, updates);
    }

    static fromFile(filePath: string): ConfigManager {
        try {
            const fs = require('fs');
            const configData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return new ConfigManager(configData);
        } catch (error) {
            console.warn(`Failed to load config from ${filePath}, using defaults:`, error);
            return new ConfigManager();
        }
    }

    static fromEnv(): ConfigManager {
        const envConfig: Partial<ServerConfig> = {};

        if (process.env.XLN_SERVER_ID) {
            envConfig.id = process.env.XLN_SERVER_ID;
        }

        if (process.env.XLN_HOST) {
            envConfig.host = process.env.XLN_HOST;
        }

        if (process.env.XLN_PORT) {
            envConfig.port = parseInt(process.env.XLN_PORT, 10);
        }

        if (process.env.XLN_STORAGE_PATH) {
            envConfig.storage = {
                ...defaultConfig.storage,
                path: process.env.XLN_STORAGE_PATH
            };
        }

        if (process.env.XLN_BLOCK_TIME) {
            envConfig.consensus = {
                ...defaultConfig.consensus,
                blockTime: parseInt(process.env.XLN_BLOCK_TIME, 10)
            };
        }

        return new ConfigManager(envConfig);
    }

    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.config.id || this.config.id.length === 0) {
            errors.push('Server ID is required');
        }

        if (!this.config.host || this.config.host.length === 0) {
            errors.push('Host is required');
        }

        if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
            errors.push('Port must be between 1 and 65535');
        }

        if (!this.config.storage.path || this.config.storage.path.length === 0) {
            errors.push('Storage path is required');
        }

        if (this.config.storage.snapshotInterval < 1) {
            errors.push('Snapshot interval must be at least 1');
        }

        if (this.config.consensus.blockTime < 10) {
            errors.push('Block time must be at least 10ms');
        }

        if (this.config.consensus.proposalTimeout < 1000) {
            errors.push('Proposal timeout must be at least 1 second');
        }

        if (this.config.limits.maxChannels < 1) {
            errors.push('Max channels must be at least 1');
        }

        if (this.config.limits.maxEntities < 1) {
            errors.push('Max entities must be at least 1');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private mergeConfig(base: ServerConfig, updates?: Partial<ServerConfig>): ServerConfig {
        if (!updates) return { ...base };

        return {
            ...base,
            ...updates,
            storage: {
                ...base.storage,
                ...(updates.storage || {})
            },
            consensus: {
                ...base.consensus,
                ...(updates.consensus || {})
            },
            limits: {
                ...base.limits,
                ...(updates.limits || {})
            }
        };
    }

    toJSON(): string {
        return JSON.stringify(this.config, null, 2);
    }

    saveToFile(filePath: string): void {
        try {
            const fs = require('fs');
            const path = require('path');

            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(filePath, this.toJSON(), 'utf8');
        } catch (error) {
            throw new Error(`Failed to save config to ${filePath}: ${error}`);
        }
    }
}
