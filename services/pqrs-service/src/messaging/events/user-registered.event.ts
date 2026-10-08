import { InvalidMessageError } from '../invalid-message.error';

export interface UserRegisteredEvent {
  eventId: string;
  eventType: 'UserRegistered';
  source: string;
  createdAt: string;
  data: {
    userId: string;
    email: string;
    role: string;
    status: string;
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function parseUserRegisteredEvent(raw: unknown): UserRegisteredEvent {
  if (!isObject(raw)) {
    throw new InvalidMessageError('message body must be a JSON object');
  }
  if (raw.eventType !== 'UserRegistered') {
    throw new InvalidMessageError(`unexpected eventType "${String(raw.eventType)}"`);
  }
  for (const field of ['eventId', 'source', 'createdAt'] as const) {
    if (!isNonEmptyString(raw[field])) {
      throw new InvalidMessageError(`missing or invalid "${field}"`);
    }
  }
  if (Number.isNaN(Date.parse(raw.createdAt as string))) {
    throw new InvalidMessageError('"createdAt" is not a valid date');
  }

  const data = raw.data;
  if (!isObject(data)) {
    throw new InvalidMessageError('missing "data"');
  }
  for (const field of ['userId', 'email', 'role', 'status'] as const) {
    if (!isNonEmptyString(data[field])) {
      throw new InvalidMessageError(`missing or invalid "data.${field}"`);
    }
  }

  return {
    eventId: raw.eventId as string,
    eventType: 'UserRegistered',
    source: raw.source as string,
    createdAt: raw.createdAt as string,
    data: {
      userId: data.userId as string,
      email: data.email as string,
      role: data.role as string,
      status: data.status as string,
    },
  };
}
