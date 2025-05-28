import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
	ConsensusConfig,
	LimitsConfig,
	ServerConfig,
	StorageConfig,
	TreeConfig,
} from "../types/core";

export const defaultConfig: ServerConfig = {
	id: "xln-server-001",
	host: "localhost",
	port: 8080,
	storage: {
		path: "./data",
		snapshotInterval: 100,
		cacheSize: "1GB",
	},
	consensus: {
		blockTime: 100, // 100ms
		proposalTimeout: 30000, // 30 seconds
	},
	limits: {
		maxChannels: 10000000,
		maxEntities: 100000,
		maxBlockSize: "1MB",
	},
};

export const defaultTreeConfig: TreeConfig = {
	bitWidth: 4,
	leafThreshold: 16,
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
			const configData = JSON.parse(readFileSync(filePath, "utf8"));
			return new ConfigManager(configData);
		} catch (error) {
			console.warn(
				`Failed to load config from ${filePath}, using defaults:`,
				error,
			);
			return new ConfigManager();
		}
	}

	static fromEnv(): ConfigManager {
		const envConfig: Partial<ServerConfig> = {};

		const serverId = process.env["XLN_SERVER_ID" as const];
		if (serverId) {
			envConfig.id = serverId;
		}

		const host = process.env["XLN_HOST" as const];
		if (host) {
			envConfig.host = host;
		}

		const port = process.env["XLN_PORT" as const];
		if (port) {
			envConfig.port = Number.parseInt(port, 10);
		}

		const storagePath = process.env["XLN_STORAGE_PATH" as const];
		if (storagePath) {
			envConfig.storage = {
				...defaultConfig.storage,
				path: storagePath,
			};
		}

		const blockTime = process.env["XLN_BLOCK_TIME" as const];
		if (blockTime) {
			envConfig.consensus = {
				...defaultConfig.consensus,
				blockTime: Number.parseInt(blockTime, 10),
			};
		}

		return new ConfigManager(envConfig);
	}

	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		if (!this.config.id || this.config.id.length === 0) {
			errors.push("Server ID is required");
		}

		if (!this.config.host || this.config.host.length === 0) {
			errors.push("Host is required");
		}

		if (!this.config.port || this.config.port < 1 || this.config.port > 65535) {
			errors.push("Port must be between 1 and 65535");
		}

		if (!this.config.storage.path || this.config.storage.path.length === 0) {
			errors.push("Storage path is required");
		}

		if (this.config.storage.snapshotInterval < 1) {
			errors.push("Snapshot interval must be at least 1");
		}

		if (this.config.consensus.blockTime < 10) {
			errors.push("Block time must be at least 10ms");
		}

		if (this.config.consensus.proposalTimeout < 1000) {
			errors.push("Proposal timeout must be at least 1 second");
		}

		if (this.config.limits.maxChannels < 1) {
			errors.push("Max channels must be at least 1");
		}

		if (this.config.limits.maxEntities < 1) {
			errors.push("Max entities must be at least 1");
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	private mergeConfig(
		base: ServerConfig,
		updates?: Partial<ServerConfig>,
	): ServerConfig {
		if (!updates) return { ...base };

		return {
			...base,
			...updates,
			storage: {
				...base.storage,
				...(updates.storage || {}),
			},
			consensus: {
				...base.consensus,
				...(updates.consensus || {}),
			},
			limits: {
				...base.limits,
				...(updates.limits || {}),
			},
		};
	}

	toJSON(): string {
		return JSON.stringify(this.config, null, 2);
	}

	saveToFile(filePath: string): void {
		try {
			// Ensure directory exists
			const dir = dirname(filePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			writeFileSync(filePath, this.toJSON(), "utf8");
		} catch (error) {
			throw new Error(`Failed to save config to ${filePath}: ${error}`);
		}
	}
}
