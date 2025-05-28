import { createHash } from "crypto";
import { keccak256 } from "js-sha3";

export function sha256(data: Buffer): Buffer {
	return createHash("sha256").update(data).digest();
}

export function keccak256Hash(data: Buffer): Buffer {
	return Buffer.from(keccak256.arrayBuffer(data));
}

export function computeMerkleRoot(hashes: Buffer[]): Buffer {
	if (hashes.length === 0) {
		return Buffer.alloc(32);
	}

	if (hashes.length === 1) {
		return hashes[0];
	}

	let level = [...hashes];

	while (level.length > 1) {
		const nextLevel: Buffer[] = [];

		for (let i = 0; i < level.length; i += 2) {
			if (i + 1 < level.length) {
				const combined = Buffer.concat([level[i], level[i + 1]]);
				nextLevel.push(keccak256Hash(combined));
			} else {
				nextLevel.push(level[i]);
			}
		}

		level = nextLevel;
	}

	return level[0];
}

export function hashChildren(children: Map<number, Buffer>): Buffer {
	if (children.size === 0) {
		return Buffer.alloc(32);
	}

	const sortedKeys = Array.from(children.keys()).sort((a, b) => a - b);
	const data = Buffer.concat([
		...sortedKeys.map((key) => {
			const keyBuf = Buffer.alloc(4);
			keyBuf.writeUInt32BE(key);
			return Buffer.concat([keyBuf, children.get(key)!]);
		}),
	]);

	return keccak256Hash(data);
}

export function hashValues(values: Map<string, Buffer>): Buffer {
	if (values.size === 0) {
		return Buffer.alloc(32);
	}

	const sortedKeys = Array.from(values.keys()).sort();
	const data = Buffer.concat([
		...sortedKeys.map((key) => {
			const keyBuf = Buffer.from(key, "utf8");
			const keyLenBuf = Buffer.alloc(4);
			keyLenBuf.writeUInt32BE(keyBuf.length);
			return Buffer.concat([keyLenBuf, keyBuf, values.get(key)!]);
		}),
	]);

	return keccak256Hash(data);
}
