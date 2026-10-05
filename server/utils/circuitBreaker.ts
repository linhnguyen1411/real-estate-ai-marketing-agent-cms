/**
 * Lightweight Circuit Breaker with exponential backoff & jitter for external APIs (AI, Telegram, VPS).
 */

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Consecutive failures before tripping open (default: 5)
  cooldownPeriodMs?: number; // Time before testing half-open state (default: 30000ms)
  timeoutMs?: number; // Call timeout in milliseconds (default: 15000ms)
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreakerOpenError extends Error {
  statusCode = 503;
  constructor(name: string) {
    super(`Circuit breaker for service "${name}" is currently OPEN (service degraded)`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  public state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownPeriodMs: number;
  private readonly timeoutMs: number;

  constructor(public readonly name: string, options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownPeriodMs = options.cooldownPeriodMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    if (this.state === 'OPEN') {
      if (now - this.lastFailureTime > this.cooldownPeriodMs) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    try {
      const result = await this.executeWithTimeout(fn, this.timeoutMs);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private async executeWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`[CIRCUIT_BREAKER] Service "${this.name}" tripped to OPEN state after ${this.failureCount} failures.`);
    }
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  let cb = breakers.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, options);
    breakers.set(name, cb);
  }
  return cb;
}
