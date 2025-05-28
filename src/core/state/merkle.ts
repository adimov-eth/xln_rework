import { hashChildren, hashValues, keccak256Hash } from "../../crypto/hashing";
import type { TreeConfig } from "../../types/core";
import { formatPath, parsePath, pathToNibbles } from "../../utils/encoding";

export interface MerkleNode {
	type: "branch" | "leaf";
	hash?: Buffer;
	isDirty: boolean;
}

export interface BranchNode extends MerkleNode {
	type: "branch";
	children: Map<number, MerkleNode>;
}

export interface LeafNode extends MerkleNode {
	type: "leaf";
	values: Map<string, Buffer>;
}

export class MerkleTree {
	private root: MerkleNode;
	private config: TreeConfig;

	constructor(config: TreeConfig = { bitWidth: 4, leafThreshold: 16 }) {
		this.config = config;
		this.root = this.createLeafNode();
	}

	private createBranchNode(): BranchNode {
		return {
			type: "branch",
			children: new Map(),
			isDirty: true,
		};
	}

	private createLeafNode(): LeafNode {
		return {
			type: "leaf",
			values: new Map(),
			isDirty: true,
		};
	}

	set(key: Buffer, value: Buffer): void {
		const path = pathToNibbles(key, this.config.bitWidth);
		this.setAtPath(this.root, path, formatPath(path), value);
		this.markDirty(this.root);
	}

	get(key: Buffer): Buffer | undefined {
		const path = pathToNibbles(key, this.config.bitWidth);
		const formattedPath = formatPath(path);
		return this.getAtPath(this.root, formattedPath);
	}

	delete(key: Buffer): boolean {
		const path = pathToNibbles(key, this.config.bitWidth);
		const formattedPath = formatPath(path);
		const deleted = this.deleteAtPath(this.root, formattedPath);
		if (deleted) {
			this.markDirty(this.root);
		}
		return deleted;
	}

	getRoot(): Buffer {
		return this.computeHash(this.root);
	}

	private setAtPath(
		node: MerkleNode,
		remainingPath: string,
		fullPath: string,
		value: Buffer,
	): void {
		if (node.type === "leaf") {
			node.values.set(fullPath, value);
			this.markDirty(node);

			if (node.values.size > this.config.leafThreshold) {
				this.splitLeafNode(node);
			}
		} else {
			const chunk = Number.parseInt(remainingPath[0], 16);
			const nextPath = remainingPath.substring(1);

			if (!node.children.has(chunk)) {
				node.children.set(chunk, this.createLeafNode());
			}

			const child = node.children.get(chunk)!;
			this.setAtPath(child, nextPath, fullPath, value);
			this.markDirty(node);
		}
	}

	private getAtPath(node: MerkleNode, path: string): Buffer | undefined {
		if (node.type === "leaf") {
			return node.values.get(path);
		}

		const { nibbles } = parsePath(path);
		if (nibbles.length === 0) {
			return undefined;
		}

		const chunk = Number.parseInt(nibbles[0], 16);
		const child = node.children.get(chunk);

		if (!child) {
			return undefined;
		}

		const remainingNibbles = nibbles.substring(1);
		const remainingPath = formatPath(remainingNibbles);
		return this.getAtPath(child, remainingPath);
	}

	private deleteAtPath(node: MerkleNode, path: string): boolean {
		if (node.type === "leaf") {
			const deleted = node.values.delete(path);
			if (deleted) {
				this.markDirty(node);
			}
			return deleted;
		}

		const { nibbles } = parsePath(path);
		if (nibbles.length === 0) {
			return false;
		}

		const chunk = Number.parseInt(nibbles[0], 16);
		const child = node.children.get(chunk);

		if (!child) {
			return false;
		}

		const remainingNibbles = nibbles.substring(1);
		const remainingPath = formatPath(remainingNibbles);
		const deleted = this.deleteAtPath(child, remainingPath);

		if (deleted) {
			this.markDirty(node);

			if (child.type === "leaf" && child.values.size === 0) {
				node.children.delete(chunk);
			}
		}

		return deleted;
	}

	private splitLeafNode(leafNode: LeafNode): void {
		// Store the original values before clearing
		const originalValues = new Map(leafNode.values);

		// Clear the leaf node's values and convert it to a branch node
		delete (leafNode as any).values;
		(leafNode as any).type = "branch";
		(leafNode as any).children = new Map();

		const branchNode = leafNode as any as BranchNode;

		for (const [path, value] of originalValues) {
			const { nibbles } = parsePath(path);
			if (nibbles.length > 0) {
				const chunk = Number.parseInt(nibbles[0], 16);

				if (!branchNode.children.has(chunk)) {
					branchNode.children.set(chunk, this.createLeafNode());
				}

				const child = branchNode.children.get(chunk)! as LeafNode;
				const remainingNibbles = nibbles.substring(1);
				const newPath = formatPath(remainingNibbles);
				child.values.set(newPath, value);
				this.markDirty(child);
			}
		}

		this.markDirty(branchNode);
	}

	private markDirty(node: MerkleNode): void {
		node.isDirty = true;
		node.hash = undefined;
	}

	private computeHash(node: MerkleNode): Buffer {
		if (node.hash && !node.isDirty) {
			return node.hash;
		}

		let hash: Buffer;

		if (node.type === "leaf") {
			hash = hashValues(node.values);
		} else {
			const childHashes = new Map<number, Buffer>();
			for (const [chunk, child] of node.children) {
				childHashes.set(chunk, this.computeHash(child));
			}
			hash = hashChildren(childHashes);
		}

		node.hash = hash;
		node.isDirty = false;
		return hash;
	}

	visualize(): string {
		return this.visualizeNode(this.root, "", true);
	}

	private visualizeNode(
		node: MerkleNode,
		prefix: string,
		isLast: boolean,
	): string {
		const connector = isLast ? "└── " : "├── ";
		const extension = isLast ? "    " : "│   ";

		let result = prefix + connector;

		if (node.type === "leaf") {
			const count = node.values.size;
			const hashStr = node.hash
				? node.hash.toString("hex").substring(0, 8) + "..."
				: "dirty";
			result += `[Leaf] (${count} values) hash:${hashStr}\n`;
		} else {
			const childCount = node.children.size;
			const hashStr = node.hash
				? node.hash.toString("hex").substring(0, 8) + "..."
				: "dirty";
			result += `[Branch] (${childCount} children) hash:${hashStr}\n`;

			const sortedChildren = Array.from(node.children.entries()).sort(
				([a], [b]) => a - b,
			);
			for (let i = 0; i < sortedChildren.length; i++) {
				const [chunk, child] = sortedChildren[i];
				const isLastChild = i === sortedChildren.length - 1;
				result += prefix + extension + `${chunk.toString(16)}:\n`;
				result += this.visualizeNode(child, prefix + extension, isLastChild);
			}
		}

		return result;
	}

	getStats(): {
		totalNodes: number;
		leafNodes: number;
		branchNodes: number;
		totalValues: number;
		depth: number;
	} {
		const stats = {
			totalNodes: 0,
			leafNodes: 0,
			branchNodes: 0,
			totalValues: 0,
			depth: 0,
		};

		this.collectStats(this.root, 0, stats);
		return stats;
	}

	private collectStats(node: MerkleNode, depth: number, stats: any): void {
		stats.totalNodes++;
		stats.depth = Math.max(stats.depth, depth);

		if (node.type === "leaf") {
			stats.leafNodes++;
			stats.totalValues += node.values.size;
		} else {
			stats.branchNodes++;
			for (const child of node.children.values()) {
				this.collectStats(child, depth + 1, stats);
			}
		}
	}
}
