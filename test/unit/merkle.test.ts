import { MerkleTree } from '../../src/core/state/merkle';
import { TreeConfig } from '../../src/types/core';

describe('MerkleTree', () => {
    let tree: MerkleTree;
    let config: TreeConfig;

    beforeEach(() => {
        config = { bitWidth: 4, leafThreshold: 16 };
        tree = new MerkleTree(config);
    });

    describe('Basic Operations', () => {
        test('should handle insertion and retrieval', () => {
            const key = Buffer.from('test-key');
            const value = Buffer.from('test-value');

            tree.set(key, value);
            const retrieved = tree.get(key);

            expect(retrieved).toEqual(value);
        });

        test('should return undefined for non-existent keys', () => {
            const key = Buffer.from('non-existent');
            const result = tree.get(key);

            expect(result).toBeUndefined();
        });

        test('should handle deletion', () => {
            const key = Buffer.from('test-key');
            const value = Buffer.from('test-value');

            tree.set(key, value);
            expect(tree.get(key)).toEqual(value);

            const deleted = tree.delete(key);
            expect(deleted).toBe(true);
            expect(tree.get(key)).toBeUndefined();
        });

        test('should return false when deleting non-existent key', () => {
            const key = Buffer.from('non-existent');
            const deleted = tree.delete(key);

            expect(deleted).toBe(false);
        });
    });

    describe('Node Splitting', () => {
        test('should split nodes when threshold exceeded', () => {
            // Insert enough values to trigger split
            for (let i = 0; i < 20; i++) {
                const key = Buffer.from(`key-${i.toString().padStart(3, '0')}`);
                const value = Buffer.from(`value-${i}`);
                tree.set(key, value);
            }

            const stats = tree.getStats();
            expect(stats.totalNodes).toBeGreaterThan(1);
            expect(stats.branchNodes).toBeGreaterThan(0);
        });

        test('should maintain data integrity after splitting', () => {
            const testData = new Map<string, Buffer>();
            
            // Insert test data
            for (let i = 0; i < 25; i++) {
                const key = Buffer.from(`test-${i.toString().padStart(4, '0')}`);
                const value = Buffer.from(`value-${i}`);
                testData.set(key.toString('hex'), value);
                tree.set(key, value);
            }

            // Verify all data is still accessible
            for (const [keyHex, expectedValue] of testData) {
                const key = Buffer.from(keyHex, 'hex');
                const retrievedValue = tree.get(key);
                expect(retrievedValue).toEqual(expectedValue);
            }
        });
    });

    describe('Hash Computation', () => {
        test('should compute consistent root hashes', () => {
            const key1 = Buffer.from('key1');
            const value1 = Buffer.from('value1');
            const key2 = Buffer.from('key2');
            const value2 = Buffer.from('value2');

            tree.set(key1, value1);
            const hash1 = tree.getRoot();

            tree.set(key2, value2);
            const hash2 = tree.getRoot();

            // Hash should change when new data is added
            expect(hash1).not.toEqual(hash2);

            // Hash should be deterministic
            const tree2 = new MerkleTree(config);
            tree2.set(key1, value1);
            tree2.set(key2, value2);
            const hash3 = tree2.getRoot();

            expect(hash2).toEqual(hash3);
        });

        test('should return zero hash for empty tree', () => {
            const root = tree.getRoot();
            expect(root).toEqual(Buffer.alloc(32));
        });
    });

    describe('Configuration', () => {
        test('should respect different bit widths', () => {
            const tree8bit = new MerkleTree({ bitWidth: 8, leafThreshold: 16 });
            const tree1bit = new MerkleTree({ bitWidth: 1, leafThreshold: 16 });

            const key = Buffer.from('test');
            const value = Buffer.from('value');

            tree8bit.set(key, value);
            tree1bit.set(key, value);

            expect(tree8bit.get(key)).toEqual(value);
            expect(tree1bit.get(key)).toEqual(value);

            // Different bit widths should produce different tree structures
            const stats8 = tree8bit.getStats();
            const stats1 = tree1bit.getStats();
            
            // 1-bit tree will be deeper for the same data
            expect(stats1.depth).toBeGreaterThan(stats8.depth);
        });

        test('should respect different leaf thresholds', () => {
            const tree4 = new MerkleTree({ bitWidth: 4, leafThreshold: 4 });
            const tree16 = new MerkleTree({ bitWidth: 4, leafThreshold: 16 });

            // Add 8 items
            for (let i = 0; i < 8; i++) {
                const key = Buffer.from(`key${i}`);
                const value = Buffer.from(`value${i}`);
                tree4.set(key, value);
                tree16.set(key, value);
            }

            const stats4 = tree4.getStats();
            const stats16 = tree16.getStats();

            // Tree with threshold 4 should have split, tree with 16 should not
            expect(stats4.branchNodes).toBeGreaterThan(0);
            expect(stats16.branchNodes).toBe(0);
        });
    });

    describe('Statistics', () => {
        test('should provide accurate statistics', () => {
            // Add known amount of data
            for (let i = 0; i < 10; i++) {
                tree.set(Buffer.from(`key${i}`), Buffer.from(`value${i}`));
            }

            const stats = tree.getStats();
            expect(stats.totalValues).toBe(10);
            expect(stats.totalNodes).toBeGreaterThan(0);
            expect(stats.leafNodes).toBeGreaterThan(0);
        });
    });

    describe('Visualization', () => {
        test('should generate tree visualization', () => {
            tree.set(Buffer.from('key1'), Buffer.from('value1'));
            tree.set(Buffer.from('key2'), Buffer.from('value2'));

            const visualization = tree.visualize();
            expect(typeof visualization).toBe('string');
            expect(visualization.length).toBeGreaterThan(0);
            expect(visualization).toContain('Leaf');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty keys and values', () => {
            const emptyKey = Buffer.alloc(0);
            const emptyValue = Buffer.alloc(0);

            tree.set(emptyKey, emptyValue);
            const retrieved = tree.get(emptyKey);

            expect(retrieved).toEqual(emptyValue);
        });

        test('should handle large keys', () => {
            const largeKey = Buffer.alloc(1024, 0xff);
            const value = Buffer.from('test');

            tree.set(largeKey, value);
            const retrieved = tree.get(largeKey);

            expect(retrieved).toEqual(value);
        });

        test('should handle duplicate insertions', () => {
            const key = Buffer.from('key');
            const value1 = Buffer.from('value1');
            const value2 = Buffer.from('value2');

            tree.set(key, value1);
            tree.set(key, value2);

            const retrieved = tree.get(key);
            expect(retrieved).toEqual(value2);
        });
    });
});