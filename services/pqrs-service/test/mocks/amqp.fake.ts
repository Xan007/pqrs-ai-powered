import { EventEmitter } from 'events';
import { ConsumeMessage } from 'amqplib';

type OnMessage = (msg: ConsumeMessage | null) => Promise<void>;

// Minimal in-memory stand-ins for amqplib's connection and channel.
export class FakeChannel extends EventEmitter {
  readonly consumers = new Map<string, OnMessage>();
  prefetch = jest.fn().mockResolvedValue(undefined);
  assertExchange = jest.fn().mockResolvedValue({});
  assertQueue = jest.fn(async (queue: string) => ({ queue, messageCount: 0, consumerCount: 0 }));
  bindQueue = jest.fn().mockResolvedValue({});
  consume = jest.fn(async (queue: string, onMessage: OnMessage) => {
    this.consumers.set(queue, onMessage);
    return { consumerTag: `ctag-${queue}` };
  });
  ack = jest.fn();
  nack = jest.fn();
  close = jest.fn().mockResolvedValue(undefined);

  /** Simulates the broker delivering a message and waits for the handler to settle it. */
  deliver(queue: string, body: unknown, redelivered = false): Promise<void> {
    const content = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const msg = { content, fields: { redelivered, routingKey: 'user.registered' }, properties: {} };
    return this.consumers.get(queue)!(msg as unknown as ConsumeMessage);
  }
}

export class FakeConnection extends EventEmitter {
  channel = new FakeChannel();
  createChannel = jest.fn(async () => this.channel);
  close = jest.fn(async () => {
    this.emit('close');
  });
}
