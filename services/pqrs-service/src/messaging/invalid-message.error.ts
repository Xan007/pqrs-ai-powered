// A message that can never be processed (bad JSON, wrong shape): it goes straight to the DLQ.
export class InvalidMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageError';
  }
}
