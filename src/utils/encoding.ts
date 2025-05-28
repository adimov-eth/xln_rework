import { decode as rlpDecode, encode as rlpEncode } from "rlp";

type RLPSerializable =
	| Buffer
	| string
	| number
	| bigint
	| RLPSerializable[]
	| { [key: string]: RLPSerializable }
	| Map<RLPSerializable, RLPSerializable>;

export function encodeRLP(data: RLPSerializable): Buffer {
	// Convert complex data types to RLP-serializable format
	const serializable = convertToSerializable(data);
	return Buffer.from(
		rlpEncode(serializable as Parameters<typeof rlpEncode>[0]),
	);
}

function convertToSerializable(data: RLPSerializable): RLPSerializable {
	if (Buffer.isBuffer(data)) {
		return data;
	}
	if (data instanceof Map) {
		return Array.from(data.entries());
	}
	if (Array.isArray(data)) {
		return data.map(convertToSerializable);
	}
	if (data && typeof data === "object") {
		const result: Record<string, RLPSerializable> = {};
		for (const [key, value] of Object.entries(data)) {
			result[key] = convertToSerializable(value);
		}
		return result;
	}
	if (typeof data === "bigint") {
		return data.toString();
	}
	return data;
}

export function decodeRLP(data: Buffer): unknown {
	return rlpDecode(data);
}

export function createMachineId(
	serverId: Buffer,
	signerId: Buffer,
	entityId: Buffer,
	submachineId: Buffer,
): Buffer {
	const id = Buffer.alloc(32);
	serverId.copy(id, 0, 0, 8);
	signerId.copy(id, 8, 0, 8);
	entityId.copy(id, 16, 0, 8);
	submachineId.copy(id, 24, 0, 8);
	return id;
}

export function parseMachineId(id: Buffer): {
	serverId: Buffer;
	signerId: Buffer;
	entityId: Buffer;
	submachineId: Buffer;
} {
	return {
		serverId: id.subarray(0, 8),
		signerId: id.subarray(8, 16),
		entityId: id.subarray(16, 24),
		submachineId: id.subarray(24, 32),
	};
}

export function pathToNibbles(path: Buffer, bitWidth = 4): string {
	const nibbles: string[] = [];
	const mask = (1 << bitWidth) - 1;

	for (const byte of path) {
		for (let i = 8 - bitWidth; i >= 0; i -= bitWidth) {
			const nibble = (byte >> i) & mask;
			nibbles.push(nibble.toString(16));
		}
	}

	return nibbles.join("");
}

export function nibblesToPath(nibbles: string, bitWidth = 4): Buffer {
	const bytes: number[] = [];
	let currentByte = 0;
	let bitsInByte = 0;

	for (const nibbleChar of nibbles) {
		const nibble = Number.parseInt(nibbleChar, 16);
		currentByte = (currentByte << bitWidth) | nibble;
		bitsInByte += bitWidth;

		if (bitsInByte >= 8) {
			bytes.push(currentByte);
			currentByte = 0;
			bitsInByte = 0;
		}
	}

	if (bitsInByte > 0) {
		bytes.push(currentByte << (8 - bitsInByte));
	}

	return Buffer.from(bytes);
}

export function formatPath(path: string): string {
	const nibbleCount = path.length.toString(16).padStart(2, "0");
	return nibbleCount + path;
}

export function parsePath(formattedPath: string): {
	nibbles: string;
	count: number;
} {
	const count = Number.parseInt(formattedPath.substring(0, 2), 16);
	const nibbles = formattedPath.substring(2, 2 + count);
	return { nibbles, count };
}
