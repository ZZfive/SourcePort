export interface CircuitBreakerOptions {
  failureThreshold?: number;
}

export class CircuitBreaker {
  readonly #failureThreshold: number;
  readonly #failures = new Map<string, number>();
  readonly #open = new Set<string>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.#failureThreshold = options.failureThreshold ?? 2;
    if (!Number.isInteger(this.#failureThreshold) || this.#failureThreshold < 1) {
      throw new RangeError("failureThreshold must be a positive integer");
    }
  }

  isOpen(key: string): boolean {
    return this.#open.has(key);
  }

  recordFailure(key: string): void {
    const failures = (this.#failures.get(key) ?? 0) + 1;
    this.#failures.set(key, failures);
    if (failures >= this.#failureThreshold) {
      this.#open.add(key);
    }
  }

  recordSuccess(key: string): void {
    this.#failures.delete(key);
    this.#open.delete(key);
  }

  reset(key: string): void {
    this.recordSuccess(key);
  }
}
