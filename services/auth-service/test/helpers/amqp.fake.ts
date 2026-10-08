import { EventEmitter } from 'events';

type ConfirmCallback = (err: Error | null) => void;

// Minimal in-memory stand-ins for amqplib's connection and confirm channel.
export class FakeConfirmChannel extends EventEmitter {
    confirmError: Error | null = null;
    assertExchange = jest.fn().mockResolvedValue({});
    close = jest.fn().mockResolvedValue(undefined);
    publish = jest.fn(
        (_exchange: string, _routingKey: string, _content: Buffer, _options: unknown, cb: ConfirmCallback) => {
            setImmediate(() => cb(this.confirmError));
            return true;
        },
    );
}

export class FakeConnection extends EventEmitter {
    channel = new FakeConfirmChannel();
    createConfirmChannel = jest.fn(async () => this.channel);
    close = jest.fn(async () => {
        this.emit('close');
    });
}

export function createConnectMock(...connections: FakeConnection[]) {
    const connect = jest.fn();
    connections.forEach((c) => connect.mockResolvedValueOnce(c));
    return connect;
}
