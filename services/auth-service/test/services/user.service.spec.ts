import { EncryptPassword } from '../../src/components/encrypt.password';
import { JwtToken } from '../../src/components/jwt.token';
import { HttpError } from '../../src/errors/http.error';
import { EventPublisher } from '../../src/messaging/event.publisher';
import { UserRepository } from '../../src/repositories/user.repository';
import { UserService } from '../../src/services/user.service';
import { buildUser, createUserRepositoryMock, UserRepositoryMock } from '../helpers/user-repository.mock';

describe('UserService', () => {
    let repo: UserRepositoryMock;
    let service: UserService;

    beforeEach(() => {
        repo = createUserRepositoryMock();
        service = new UserService(repo as unknown as UserRepository);
    });

    describe('register', () => {
        it('normalizes the email, hashes the password and creates a USER', async () => {
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockImplementation(async (data) => buildUser({ ...data, role: 'USER' }));

            const result = await service.register({ email: '  Juan@Test.COM ', password: 'password123' });

            expect(repo.findByEmail).toHaveBeenCalledWith('juan@test.com');
            const saved = repo.create.mock.calls[0][0];
            expect(saved.email).toBe('juan@test.com');
            expect(saved.role).toBeUndefined();
            expect(saved.password).not.toBe('password123');
            await expect(EncryptPassword.comparePassword('password123', saved.password)).resolves.toBe(true);
            expect(result.role).toBe('USER');
        });

        it('never returns the password hash', async () => {
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockResolvedValue(buildUser());

            const result = await service.register({ email: 'juan@test.com', password: 'password123' });

            expect(result).not.toHaveProperty('password');
        });

        it('throws 409 when the email is already registered', async () => {
            repo.findByEmail.mockResolvedValue(buildUser());

            const promise = service.register({ email: 'juan@test.com', password: 'password123' });

            await expect(promise).rejects.toBeInstanceOf(HttpError);
            await expect(promise).rejects.toMatchObject({ status: 409, code: 'HTTP.CONFLICT' });
            expect(repo.create).not.toHaveBeenCalled();
        });
    });

    describe('register → UserRegistered event', () => {
        let publisher: jest.Mocked<EventPublisher>;

        beforeEach(() => {
            publisher = { publish: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
            service = new UserService(repo as unknown as UserRepository, publisher);
        });

        afterEach(() => jest.restoreAllMocks());

        it('publishes UserRegistered with the created user', async () => {
            const user = buildUser();
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockResolvedValue(user);

            await service.register({ email: 'juan@test.com', password: 'password123' });

            expect(publisher.publish).toHaveBeenCalledTimes(1);
            const [routingKey, event] = publisher.publish.mock.calls[0];
            expect(routingKey).toBe('user.registered');
            expect(event).toMatchObject({
                eventType: 'UserRegistered',
                source: 'auth-service',
                data: { userId: user.id, email: user.email, role: 'USER', status: 'ACTIVE' },
            });
        });

        it('still registers the user when the broker is down', async () => {
            jest.spyOn(console, 'error').mockImplementation(() => undefined);
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockResolvedValue(buildUser());
            publisher.publish.mockRejectedValue(new Error('ECONNREFUSED'));

            const result = await service.register({ email: 'juan@test.com', password: 'password123' });

            expect(result.email).toBe('juan@test.com');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('UserRegistered'), 'ECONNREFUSED');
        });

        it('does not publish when the email is already registered', async () => {
            repo.findByEmail.mockResolvedValue(buildUser());

            await expect(service.register({ email: 'juan@test.com', password: 'password123' })).rejects.toThrow();
            expect(publisher.publish).not.toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('returns a valid Bearer token and the user for correct credentials', async () => {
            const hashed = await EncryptPassword.hashPassword('password123');
            const user = buildUser({ password: hashed });
            repo.findByEmail.mockResolvedValue(user);

            const result = await service.login({ email: 'JUAN@test.com', password: 'password123' });

            expect(repo.findByEmail).toHaveBeenCalledWith('juan@test.com');
            expect(result.tokenType).toBe('Bearer');
            expect(result.expiresIn).toBe(3600);
            expect(result.user).not.toHaveProperty('password');
            expect(JwtToken.verify(result.accessToken)).toEqual({
                sub: user.id,
                email: user.email,
                role: user.role,
            });
        });

        it('throws 401 when the password is wrong', async () => {
            const hashed = await EncryptPassword.hashPassword('password123');
            repo.findByEmail.mockResolvedValue(buildUser({ password: hashed }));

            await expect(service.login({ email: 'juan@test.com', password: 'wrongpass' })).rejects.toMatchObject({
                status: 401,
                message: 'Invalid email or password',
            });
        });

        it('throws the same 401 when the user does not exist', async () => {
            repo.findByEmail.mockResolvedValue(null);

            await expect(service.login({ email: 'ghost@test.com', password: 'password123' })).rejects.toMatchObject({
                status: 401,
                message: 'Invalid email or password',
            });
        });
    });

    describe('findById', () => {
        it('returns the user without password', async () => {
            repo.findById.mockResolvedValue(buildUser());

            const result = await service.findById('id');

            expect(result.email).toBe('juan@test.com');
            expect(result).not.toHaveProperty('password');
        });

        it('throws 404 when the user does not exist', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.findById('missing')).rejects.toMatchObject({ status: 404 });
        });
    });

    describe('findAll', () => {
        it('maps every user to a DTO without password', async () => {
            repo.findAll.mockResolvedValue([buildUser(), buildUser({ id: '2', email: 'b@test.com' })]);

            const result = await service.findAll();

            expect(result).toHaveLength(2);
            result.forEach((u) => expect(u).not.toHaveProperty('password'));
        });
    });

    describe('updateRole', () => {
        it('updates the role of an existing user', async () => {
            repo.findById.mockResolvedValue(buildUser());
            repo.updateRole.mockResolvedValue(buildUser({ role: 'ADMIN' }));

            const result = await service.updateRole('id', 'ADMIN');

            expect(repo.updateRole).toHaveBeenCalledWith('id', 'ADMIN');
            expect(result.role).toBe('ADMIN');
        });

        it('throws 404 and does not update when the user does not exist', async () => {
            repo.findById.mockResolvedValue(null);

            await expect(service.updateRole('missing', 'ADMIN')).rejects.toMatchObject({ status: 404 });
            expect(repo.updateRole).not.toHaveBeenCalled();
        });
    });
});
