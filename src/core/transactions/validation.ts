import { keccak256Hash } from "../../crypto/hashing";
import { MachineType, type Transaction } from "../../types/core";

export interface ValidationResult {
	valid: boolean;
	error?: string;
	code?: string;
}

export class TransactionValidator {
	private nonces: Map<string, number>;
	private maxDataSize: number;
	private maxFee: bigint;

	constructor(
		maxDataSize = 65536,
		maxFee: bigint = BigInt("1000000000000000000"),
	) {
		this.nonces = new Map();
		this.maxDataSize = maxDataSize;
		this.maxFee = maxFee;
	}

	validateTransaction(transaction: Transaction): ValidationResult {
		// Basic structure validation
		const structureResult = this.validateStructure(transaction);
		if (!structureResult.valid) {
			return structureResult;
		}

		// Nonce validation
		const nonceResult = this.validateNonce(transaction);
		if (!nonceResult.valid) {
			return nonceResult;
		}

		// Signature validation
		const signatureResult = this.validateSignature(transaction);
		if (!signatureResult.valid) {
			return signatureResult;
		}

		// Data validation
		const dataResult = this.validateData(transaction);
		if (!dataResult.valid) {
			return dataResult;
		}

		// Fee validation
		const feeResult = this.validateFee(transaction);
		if (!feeResult.valid) {
			return feeResult;
		}

		return { valid: true };
	}

	validateBatch(transactions: Transaction[]): ValidationResult[] {
		return transactions.map((tx) => this.validateTransaction(tx));
	}

	private validateStructure(transaction: Transaction): ValidationResult {
		if (!transaction.from || transaction.from.length !== 32) {
			return {
				valid: false,
				error: "Invalid sender address",
				code: "INVALID_FROM",
			};
		}

		if (!transaction.to || transaction.to.length !== 32) {
			return {
				valid: false,
				error: "Invalid recipient address",
				code: "INVALID_TO",
			};
		}

		if (typeof transaction.nonce !== "number" || transaction.nonce < 0) {
			return {
				valid: false,
				error: "Invalid nonce",
				code: "INVALID_NONCE",
			};
		}

		if (!transaction.data || !Buffer.isBuffer(transaction.data)) {
			return {
				valid: false,
				error: "Invalid data field",
				code: "INVALID_DATA",
			};
		}

		if (!transaction.signature || transaction.signature.length !== 32) {
			return {
				valid: false,
				error: "Invalid signature",
				code: "INVALID_SIGNATURE",
			};
		}

		if (
			typeof transaction.timestamp !== "number" ||
			transaction.timestamp <= 0
		) {
			return {
				valid: false,
				error: "Invalid timestamp",
				code: "INVALID_TIMESTAMP",
			};
		}

		return { valid: true };
	}

	private validateNonce(transaction: Transaction): ValidationResult {
		const senderKey = transaction.from.toString("hex");
		const expectedNonce = this.nonces.get(senderKey) || 0;

		if (transaction.nonce !== expectedNonce) {
			return {
				valid: false,
				error: `Invalid nonce. Expected: ${expectedNonce}, got: ${transaction.nonce}`,
				code: "NONCE_MISMATCH",
			};
		}

		return { valid: true };
	}

	private validateSignature(transaction: Transaction): ValidationResult {
		try {
			const txData = Buffer.concat([
				transaction.from,
				transaction.to,
				Buffer.from(transaction.nonce.toString()),
				transaction.data,
			]);

			// In a real implementation, use proper signature verification
			const expectedSig = keccak256Hash(txData);

			// For now, just check if signature is properly formatted
			if (transaction.signature.length !== 32) {
				return {
					valid: false,
					error: "Invalid signature format",
					code: "INVALID_SIGNATURE_FORMAT",
				};
			}

			return { valid: true };
		} catch (error) {
			return {
				valid: false,
				error: "Signature verification failed",
				code: "SIGNATURE_VERIFICATION_FAILED",
			};
		}
	}

	private validateData(transaction: Transaction): ValidationResult {
		if (transaction.data.length > this.maxDataSize) {
			return {
				valid: false,
				error: `Data too large. Max: ${this.maxDataSize}, got: ${transaction.data.length}`,
				code: "DATA_TOO_LARGE",
			};
		}

		// Validate data format if it's JSON
		if (transaction.data.length > 0) {
			try {
				const dataStr = transaction.data.toString();
				if (dataStr.startsWith("{") || dataStr.startsWith("[")) {
					JSON.parse(dataStr);
				}
			} catch (error) {
				return {
					valid: false,
					error: "Invalid JSON data format",
					code: "INVALID_JSON",
				};
			}
		}

		return { valid: true };
	}

	private validateFee(transaction: Transaction): ValidationResult {
		if (transaction.fee && transaction.fee > this.maxFee) {
			return {
				valid: false,
				error: `Fee too high. Max: ${this.maxFee}, got: ${transaction.fee}`,
				code: "FEE_TOO_HIGH",
			};
		}

		if (transaction.fee && transaction.fee < 0n) {
			return {
				valid: false,
				error: "Fee cannot be negative",
				code: "NEGATIVE_FEE",
			};
		}

		return { valid: true };
	}

	updateNonce(sender: Buffer, nonce: number): void {
		const senderKey = sender.toString("hex");
		this.nonces.set(senderKey, nonce + 1);
	}

	getNonce(sender: Buffer): number {
		const senderKey = sender.toString("hex");
		return this.nonces.get(senderKey) || 0;
	}

	resetNonces(): void {
		this.nonces.clear();
	}

	setNonce(sender: Buffer, nonce: number): void {
		const senderKey = sender.toString("hex");
		this.nonces.set(senderKey, nonce);
	}

	validateTransactionTiming(
		transaction: Transaction,
		currentTime: number,
		maxAge = 300000,
	): ValidationResult {
		const age = currentTime - transaction.timestamp;

		if (age > maxAge) {
			return {
				valid: false,
				error: `Transaction too old. Age: ${age}ms, max: ${maxAge}ms`,
				code: "TRANSACTION_TOO_OLD",
			};
		}

		if (transaction.timestamp > currentTime + 60000) {
			// 1 minute future tolerance
			return {
				valid: false,
				error: "Transaction timestamp in future",
				code: "FUTURE_TIMESTAMP",
			};
		}

		return { valid: true };
	}

	validateGasLimit(
		transaction: Transaction,
		gasLimit: number,
	): ValidationResult {
		// Estimate gas based on data size and complexity
		const baseGas = 21000;
		const dataGas = transaction.data.length * 16;
		const estimatedGas = baseGas + dataGas;

		if (estimatedGas > gasLimit) {
			return {
				valid: false,
				error: `Gas limit exceeded. Estimated: ${estimatedGas}, limit: ${gasLimit}`,
				code: "GAS_LIMIT_EXCEEDED",
			};
		}

		return { valid: true };
	}
}
