// End-to-end check of the asynchronous flow between the real containers:
//
//   auth-service --(UserRegistered)--> microservices.events --> pqrs.user.registered.queue --> pqrs-service
//
// Prerequisite (from the repo root):
//   docker compose --profile app up -d --build
// Run:
//   node --test "tests/e2e/*.test.mjs"
//
// Uses only Node's built-in test runner and fetch (Node 18+), plus the RabbitMQ management HTTP API.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:8001';
const MGMT_URL = process.env.RABBITMQ_MGMT_URL ?? 'http://localhost:15672';
const MGMT_AUTH = 'Basic ' + Buffer.from(process.env.RABBITMQ_MGMT_CREDENTIALS ?? 'guest:guest').toString('base64');

const EXCHANGE = 'microservices.events';
const ROUTING_KEY = 'user.registered';
const PQRS_QUEUE = 'pqrs.user.registered.queue';
const VHOST = '%2F';

async function mgmt(method, path, body) {
    const res = await fetch(`${MGMT_URL}/api${path}`, {
        method,
        headers: { Authorization: MGMT_AUTH, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
}

async function eventually(fn, { timeoutMs = 30000, intervalMs = 500, message = 'condition' } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const result = await fn();
            if (result) return result;
        } catch (err) {
            lastError = err;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ''}`);
}

async function registerUser(email) {
    const res = await fetch(`${AUTH_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'e2e-password-123' }),
    });
    assert.equal(res.status, 201, `register returned ${res.status}: ${await res.clone().text()}`);
    return res.json();
}

describe('auth-service → RabbitMQ → pqrs-service', () => {
    const runId = randomUUID().slice(0, 8);
    const spyQueue = `e2e.spy.${runId}`;

    before(async () => {
        await eventually(() => fetch(`${AUTH_URL}/health`).then((r) => r.ok), { message: 'auth-service /health' });
        // pqrs-service declares its queue and starts consuming once connected to the broker.
        await eventually(
            async () => (await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}`)).consumers >= 1,
            { timeoutMs: 60000, message: `a consumer on ${PQRS_QUEUE}` },
        );
        // RabbitMQ 4 only allows durable (or exclusive) queues; this one is deleted in after().
        // A private queue with the same binding lets us read the exact message auth-service published
        // without stealing it from pqrs-service (a direct exchange copies it to every bound queue).
        await mgmt('PUT', `/queues/${VHOST}/${spyQueue}`, { durable: true, auto_delete: false });
        await mgmt('POST', `/bindings/${VHOST}/e/${EXCHANGE}/q/${spyQueue}`, { routing_key: ROUTING_KEY });
    });

    after(async () => {
        await mgmt('DELETE', `/queues/${VHOST}/${spyQueue}`).catch(() => undefined);
    });

    it('has the expected topology', async () => {
        const exchange = await mgmt('GET', `/exchanges/${VHOST}/${EXCHANGE}`);
        assert.equal(exchange.type, 'direct');
        assert.equal(exchange.durable, true);

        const queue = await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}`);
        assert.equal(queue.durable, true);
        assert.equal(queue.arguments['x-dead-letter-exchange'], 'microservices.events.dlx');

        const bindings = await mgmt('GET', `/exchanges/${VHOST}/${EXCHANGE}/bindings/source`);
        assert.ok(
            bindings.some((b) => b.destination === PQRS_QUEUE && b.routing_key === ROUTING_KEY),
            `${PQRS_QUEUE} is not bound to ${EXCHANGE} with ${ROUTING_KEY}`,
        );
    });

    it('publishes UserRegistered when a user signs up', async () => {
        const email = `e2e-${runId}@test.com`;
        const user = await registerUser(email);

        const [message] = await eventually(
            async () => {
                const msgs = await mgmt('POST', `/queues/${VHOST}/${spyQueue}/get`, {
                    count: 1,
                    ackmode: 'ack_requeue_false',
                    encoding: 'auto',
                });
                return msgs.length ? msgs : undefined;
            },
            { timeoutMs: 10000, message: 'UserRegistered on the spy queue' },
        );

        assert.equal(message.routing_key, ROUTING_KEY);
        assert.equal(message.properties.content_type, 'application/json');
        assert.equal(message.properties.delivery_mode, 2);
        const event = JSON.parse(message.payload);
        assert.equal(event.eventType, 'UserRegistered');
        assert.equal(event.source, 'auth-service');
        assert.deepEqual(event.data, { userId: user.id, email, role: 'USER', status: 'ACTIVE' });
        assert.ok(!('password' in event.data));
    });

    it('pqrs-service consumes and acknowledges the event', async () => {
        const before = await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}`);
        const ackedBefore = before.message_stats?.ack ?? 0;
        const dlqBefore = (await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}.dlq`)).messages ?? 0;

        await registerUser(`e2e-ack-${runId}@test.com`);

        // Management stats refresh every ~5s, so poll for a while.
        await eventually(
            async () => {
                const q = await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}`);
                return (q.message_stats?.ack ?? 0) > ackedBefore && q.messages === 0;
            },
            { timeoutMs: 30000, message: `an ack on ${PQRS_QUEUE}` },
        );
        const dlqAfter = (await mgmt('GET', `/queues/${VHOST}/${PQRS_QUEUE}.dlq`)).messages ?? 0;
        assert.equal(dlqAfter, dlqBefore, 'the event was dead-lettered instead of processed');
    });
});
