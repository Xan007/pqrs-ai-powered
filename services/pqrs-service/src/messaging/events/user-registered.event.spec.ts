import { InvalidMessageError } from '../invalid-message.error';
import { userRegisteredExample } from '../../../test/fixtures/contracts';
import { parseUserRegisteredEvent } from './user-registered.event';

const validUserRegistered = userRegisteredExample;

describe('parseUserRegisteredEvent', () => {
  it('accepts the event defined in the shared contract (published by auth-service)', () => {
    expect(parseUserRegisteredEvent(validUserRegistered())).toEqual(validUserRegistered());
  });

  it('drops unknown fields', () => {
    const raw = { ...validUserRegistered(), extra: 1, data: { ...validUserRegistered().data, password: 'x' } };

    const event = parseUserRegisteredEvent(raw);

    expect(event).not.toHaveProperty('extra');
    expect(event.data).not.toHaveProperty('password');
  });

  it.each([
    ['a non-object body', 'hello'],
    ['an array body', []],
    ['null', null],
    ['another event type', { ...validUserRegistered(), eventType: 'TicketCreated' }],
    ['a missing eventId', { ...validUserRegistered(), eventId: undefined }],
    ['an invalid createdAt', { ...validUserRegistered(), createdAt: 'yesterday' }],
    ['a missing data block', { ...validUserRegistered(), data: undefined }],
    ['an empty userId', { ...validUserRegistered(), data: { ...validUserRegistered().data, userId: ' ' } }],
    ['a numeric email', { ...validUserRegistered(), data: { ...validUserRegistered().data, email: 42 } }],
  ])('rejects %s', (_case, raw) => {
    expect(() => parseUserRegisteredEvent(raw)).toThrow(InvalidMessageError);
  });
});
