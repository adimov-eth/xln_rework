import { EventEmitter } from 'events';
import { METRICS_INTERVAL, SLOW_OPERATION_THRESHOLD, MEMORY_WARNING_THRESHOLD } from './constants';

export interface Metric {
    name: string;
    value: number;
    timestamp: number;
    tags?: Record<string, string>;
}

export interface CounterMetric extends Metric {
    type: 'counter';
}

export interface GaugeMetric extends Metric {
    type: 'gauge';
}

export interface HistogramMetric extends Metric {
    type: 'histogram';
    buckets: number[];
}

export interface TimingMetric extends Metric {
    type: 'timing';
    duration: number;
}

export type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric | TimingMetric;

export class MetricsCollector extends EventEmitter {
    private metrics: Map<string, AnyMetric[]> = new Map();
    private counters: Map<string, number> = new Map();
    private gauges: Map<string, number> = new Map();
    private timings: Map<string, number[]> = new Map();
    private isCollecting = false;
    private intervalId?: NodeJS.Timeout;

    constructor() {
        super();
    }

    start(): void {
        if (this.isCollecting) return;
        
        this.isCollecting = true;
        this.intervalId = setInterval(() => {
            this.collectSystemMetrics();
            this.emitMetrics();
        }, METRICS_INTERVAL);

        console.log('Metrics collection started');
    }

    stop(): void {
        if (!this.isCollecting) return;
        
        this.isCollecting = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        console.log('Metrics collection stopped');
    }

    // Counter methods
    incrementCounter(name: string, value: number = 1, tags?: Record<string, string>): void {
        const current = this.counters.get(name) || 0;
        this.counters.set(name, current + value);
        
        this.recordMetric({
            type: 'counter',
            name,
            value: current + value,
            timestamp: Date.now(),
            tags
        });
    }

    // Gauge methods
    setGauge(name: string, value: number, tags?: Record<string, string>): void {
        this.gauges.set(name, value);
        
        this.recordMetric({
            type: 'gauge',
            name,
            value,
            timestamp: Date.now(),
            tags
        });
    }

    adjustGauge(name: string, delta: number, tags?: Record<string, string>): void {
        const current = this.gauges.get(name) || 0;
        const newValue = current + delta;
        this.setGauge(name, newValue, tags);
    }

    // Timing methods
    recordTiming(name: string, duration: number, tags?: Record<string, string>): void {
        if (!this.timings.has(name)) {
            this.timings.set(name, []);
        }
        
        const timings = this.timings.get(name)!;
        timings.push(duration);
        
        // Keep only last 1000 timings
        if (timings.length > 1000) {
            timings.shift();
        }

        this.recordMetric({
            type: 'timing',
            name,
            value: duration,
            duration,
            timestamp: Date.now(),
            tags
        });

        // Emit warning for slow operations
        if (duration > SLOW_OPERATION_THRESHOLD) {
            this.emit('slowOperation', { name, duration, tags });
        }
    }

    // Histogram methods
    recordHistogram(name: string, value: number, buckets: number[], tags?: Record<string, string>): void {
        this.recordMetric({
            type: 'histogram',
            name,
            value,
            buckets,
            timestamp: Date.now(),
            tags
        });
    }

    // Timing helper
    async time<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            this.recordTiming(name, Date.now() - start, tags);
            return result;
        } catch (error) {
            this.recordTiming(name, Date.now() - start, { ...tags, error: 'true' });
            throw error;
        }
    }

    timeSync<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
        const start = Date.now();
        try {
            const result = fn();
            this.recordTiming(name, Date.now() - start, tags);
            return result;
        } catch (error) {
            this.recordTiming(name, Date.now() - start, { ...tags, error: 'true' });
            throw error;
        }
    }

    // System metrics collection
    private collectSystemMetrics(): void {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Memory metrics
        this.setGauge('system.memory.rss', memUsage.rss);
        this.setGauge('system.memory.heapTotal', memUsage.heapTotal);
        this.setGauge('system.memory.heapUsed', memUsage.heapUsed);
        this.setGauge('system.memory.external', memUsage.external);

        // CPU metrics
        this.setGauge('system.cpu.user', cpuUsage.user);
        this.setGauge('system.cpu.system', cpuUsage.system);

        // Process metrics
        this.setGauge('system.uptime', process.uptime());
        this.setGauge('system.pid', process.pid);

        // Memory warning
        const memoryUsageRatio = memUsage.heapUsed / memUsage.heapTotal;
        if (memoryUsageRatio > MEMORY_WARNING_THRESHOLD) {
            this.emit('memoryWarning', {
                ratio: memoryUsageRatio,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal
            });
        }
    }

    private recordMetric(metric: AnyMetric): void {
        if (!this.metrics.has(metric.name)) {
            this.metrics.set(metric.name, []);
        }
        
        const metricArray = this.metrics.get(metric.name)!;
        metricArray.push(metric);
        
        // Keep only last 1000 metrics per name
        if (metricArray.length > 1000) {
            metricArray.shift();
        }
    }

    private emitMetrics(): void {
        const summary = this.getMetricsSummary();
        this.emit('metrics', summary);
    }

    // Query methods
    getCounter(name: string): number {
        return this.counters.get(name) || 0;
    }

    getGauge(name: string): number {
        return this.gauges.get(name) || 0;
    }

    getTimingStats(name: string): {
        count: number;
        min: number;
        max: number;
        avg: number;
        p95: number;
        p99: number;
    } | null {
        const timings = this.timings.get(name);
        if (!timings || timings.length === 0) {
            return null;
        }

        const sorted = [...timings].sort((a, b) => a - b);
        const count = sorted.length;
        
        return {
            count,
            min: sorted[0],
            max: sorted[count - 1],
            avg: sorted.reduce((sum, val) => sum + val, 0) / count,
            p95: sorted[Math.floor(count * 0.95)],
            p99: sorted[Math.floor(count * 0.99)]
        };
    }

    getAllMetrics(): Map<string, AnyMetric[]> {
        return new Map(this.metrics);
    }

    getMetricsSummary(): {
        counters: Record<string, number>;
        gauges: Record<string, number>;
        timings: Record<string, any>;
        timestamp: number;
    } {
        const timingStats: Record<string, any> = {};
        for (const [name] of this.timings) {
            timingStats[name] = this.getTimingStats(name);
        }

        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(this.gauges),
            timings: timingStats,
            timestamp: Date.now()
        };
    }

    // Clear old metrics
    clearMetrics(olderThan?: number): void {
        const cutoff = olderThan || (Date.now() - 24 * 60 * 60 * 1000); // 24 hours

        for (const [name, metricArray] of this.metrics) {
            const filtered = metricArray.filter(metric => metric.timestamp > cutoff);
            this.metrics.set(name, filtered);
        }
    }

    // Export metrics in Prometheus format
    toPrometheusFormat(): string {
        const lines: string[] = [];
        
        // Counters
        for (const [name, value] of this.counters) {
            lines.push(`# TYPE ${name} counter`);
            lines.push(`${name} ${value}`);
        }
        
        // Gauges
        for (const [name, value] of this.gauges) {
            lines.push(`# TYPE ${name} gauge`);
            lines.push(`${name} ${value}`);
        }
        
        // Timing histograms
        for (const [name] of this.timings) {
            const stats = this.getTimingStats(name);
            if (stats) {
                lines.push(`# TYPE ${name} histogram`);
                lines.push(`${name}_count ${stats.count}`);
                lines.push(`${name}_sum ${stats.avg * stats.count}`);
                lines.push(`${name}_bucket{le="0.1"} ${this.countTimingsInBucket(name, 100)}`);
                lines.push(`${name}_bucket{le="0.5"} ${this.countTimingsInBucket(name, 500)}`);
                lines.push(`${name}_bucket{le="1.0"} ${this.countTimingsInBucket(name, 1000)}`);
                lines.push(`${name}_bucket{le="5.0"} ${this.countTimingsInBucket(name, 5000)}`);
                lines.push(`${name}_bucket{le="+Inf"} ${stats.count}`);
            }
        }
        
        return lines.join('\n');
    }

    private countTimingsInBucket(name: string, threshold: number): number {
        const timings = this.timings.get(name) || [];
        return timings.filter(timing => timing <= threshold).length;
    }
}

// XLN-specific metrics
export class XLNMetrics {
    private collector: MetricsCollector;

    constructor(collector: MetricsCollector) {
        this.collector = collector;
    }

    // Machine metrics
    recordMachineCreated(type: string): void {
        this.collector.incrementCounter('xln.machines.created', 1, { type });
        this.collector.adjustGauge(`xln.machines.active.${type}`, 1);
    }

    recordMachineDestroyed(type: string): void {
        this.collector.incrementCounter('xln.machines.destroyed', 1, { type });
        this.collector.adjustGauge(`xln.machines.active.${type}`, -1);
    }

    // Transaction metrics
    recordTransactionReceived(type: string): void {
        this.collector.incrementCounter('xln.transactions.received', 1, { type });
    }

    recordTransactionProcessed(type: string, success: boolean): void {
        this.collector.incrementCounter('xln.transactions.processed', 1, { 
            type, 
            status: success ? 'success' : 'failed' 
        });
    }

    recordTransactionTiming(operation: string, duration: number): void {
        this.collector.recordTiming(`xln.transaction.${operation}`, duration);
    }

    // Block metrics
    recordBlockCreated(blockNumber: number, txCount: number): void {
        this.collector.incrementCounter('xln.blocks.created');
        this.collector.setGauge('xln.block.number', blockNumber);
        this.collector.setGauge('xln.block.transactions', txCount);
    }

    recordBlockTiming(duration: number): void {
        this.collector.recordTiming('xln.block.processing_time', duration);
    }

    // Channel metrics
    recordChannelOpened(): void {
        this.collector.incrementCounter('xln.channels.opened');
        this.collector.adjustGauge('xln.channels.active', 1);
    }

    recordChannelClosed(cooperative: boolean): void {
        this.collector.incrementCounter('xln.channels.closed', 1, { 
            type: cooperative ? 'cooperative' : 'forced' 
        });
        this.collector.adjustGauge('xln.channels.active', -1);
    }

    recordPayment(amount: string, asset: string): void {
        this.collector.incrementCounter('xln.payments.count', 1, { asset });
        this.collector.adjustGauge('xln.payments.volume', parseFloat(amount));
    }

    // State metrics
    recordStateUpdate(type: string, duration: number): void {
        this.collector.recordTiming(`xln.state.${type}`, duration);
    }

    recordMerkleTreeStats(nodes: number, depth: number): void {
        this.collector.setGauge('xln.merkle.nodes', nodes);
        this.collector.setGauge('xln.merkle.depth', depth);
    }

    // Network metrics
    recordNetworkMessage(type: string, size: number): void {
        this.collector.incrementCounter('xln.network.messages', 1, { type });
        this.collector.adjustGauge('xln.network.bytes_transferred', size);
    }

    recordAPIRequest(method: string, status: number, duration: number): void {
        this.collector.incrementCounter('xln.api.requests', 1, { 
            method, 
            status: status.toString() 
        });
        this.collector.recordTiming('xln.api.request_duration', duration, { method });
    }

    recordWebSocketConnection(connected: boolean): void {
        this.collector.adjustGauge('xln.websocket.connections', connected ? 1 : -1);
    }

    // Error metrics
    recordError(component: string, type: string): void {
        this.collector.incrementCounter('xln.errors', 1, { component, type });
    }

    // Performance metrics
    recordMemoryUsage(component: string, bytes: number): void {
        this.collector.setGauge(`xln.memory.${component}`, bytes);
    }

    recordCPUUsage(component: string, percentage: number): void {
        this.collector.setGauge(`xln.cpu.${component}`, percentage);
    }
}

// Global metrics instance
export const metricsCollector = new MetricsCollector();
export const xlnMetrics = new XLNMetrics(metricsCollector);

// Decorator for automatic method timing
export function measureTime(metricName?: string) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const name = metricName || `${target.constructor.name}.${propertyKey}`;
        
        descriptor.value = async function(...args: any[]) {
            return metricsCollector.time(name, () => originalMethod.apply(this, args));
        };
        
        return descriptor;
    };
}

// Decorator for counting method calls
export function countCalls(metricName?: string) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        const name = metricName || `${target.constructor.name}.${propertyKey}.calls`;
        
        descriptor.value = function(...args: any[]) {
            metricsCollector.incrementCounter(name);
            return originalMethod.apply(this, args);
        };
        
        return descriptor;
    };
}