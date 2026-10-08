import request from 'supertest';
import { createApp } from '../src/app';
import { EncryptPassword } from '../src/components/encrypt.password';
import { JwtToken } from '../src/components/jwt.token';
import { UserRepository } from '../src/repositories/user.repository';
import { buildUser, createUserRepositoryMock, UserRepositoryMock } from './helpers/user-repository.mock';

// HTTP-level tests: real routes, middlewares and service, with the repository mocked (no database).
describe('Auth Service HTTP API', () => {
    let repo: UserRepositoryMock;
    let app: ReturnType<typeof createApp>;

    const user = buildUser();
    const admin = buildUser({ id: 'admin-id', email: 'admin@test.com', role: 'ADMIN' });
    const userToken = JwtToken.sign({ sub: user.id, email: user.email, role: 'USER' });
    const adminToken = JwtToken.sign({ sub: admin.id, email: admin.email, role: 'ADMIN' });

    beforeEach(() => {
        repo = createUserRepositoryMock();
        app = createApp(repo as unknown as UserRepository);
    });

    it('GET /health', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok', service: 'auth-service' });
    });

    describe('POST /api/v1/auth/register', () => {
        it('201 creates the user', async () => {
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockResolvedValue(user);

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ email: 'juan@test.com', password: 'password123' });

            expect(res.status).toBe(201);
            expect(res.body).toMatchObject({ id: user.id, email: user.email, role: 'USER' });
            expect(res.body).not.toHaveProperty('password');
        });

        it('409 when the email already exists', async () => {
            repo.findByEmail.mockResolvedValue(user);

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ email: 'juan@test.com', password: 'password123' });

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('HTTP.CONFLICT');
        });

        it('201 publishes a UserRegistered event through the injected publisher', async () => {
            const publisher = { publish: jest.fn().mockResolvedValue(undefined), close: jest.fn() };
            app = createApp(repo as unknown as UserRepository, publisher);
            repo.findByEmail.mockResolvedValue(null);
            repo.create.mockResolvedValue(user);

            const res = await request(app)
                .post('/api/v1/auth/register')
                .send({ email: 'juan@test.com', password: 'password123' });

            expect(res.status).toBe(201);
            expect(publisher.publish).toHaveBeenCalledWith(
                'user.registered',
                expect.objectContaining({ eventType: 'UserRegistered', data: expect.objectContaining({ userId: user.id }) }),
            );
        });

        it('400 with validation details and the standard error shape', async () => {
            const res = await request(app).post('/api/v1/auth/register').send({ email: 'bad', password: '1' });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 'VALIDATION.FAILED', message: 'Validation failed' });
            expect(res.body.details.length).toBeGreaterThan(0);
            expect(res.body.traceId).toMatch(/^req_/);
            expect(res.headers['x-request-id']).toBe(res.body.traceId);
            expect(repo.create).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v1/auth/login', () => {
        it('200 returns an access token', async () => {
            repo.findByEmail.mockResolvedValue({ ...user, password: await EncryptPassword.hashPassword('password123') });

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'juan@test.com', password: 'password123' });

            expect(res.status).toBe(200);
            expect(res.body.tokenType).toBe('Bearer');
            expect(JwtToken.verify(res.body.accessToken).sub).toBe(user.id);
        });

        it('401 for invalid credentials', async () => {
            repo.findByEmail.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ email: 'juan@test.com', password: 'password123' });

            expect(res.status).toBe(401);
            expect(res.body.code).toBe('AUTH.UNAUTHORIZED');
        });

        it('400 for malformed JSON', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .set('Content-Type', 'application/json')
                .send('{bad');

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Malformed JSON body');
        });
    });

    describe('GET /api/v1/auth/me', () => {
        it('200 returns the current user', async () => {
            repo.findById.mockResolvedValue(user);

            const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(200);
            expect(repo.findById).toHaveBeenCalledWith(user.id);
            expect(res.body.email).toBe(user.email);
        });

        it('401 without token', async () => {
            const res = await request(app).get('/api/v1/auth/me');

            expect(res.status).toBe(401);
        });
    });

    it('GET /api/v1/auth/verify returns the token payload', async () => {
        const res = await request(app).get('/api/v1/auth/verify').set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ valid: true, user: { sub: user.id, email: user.email, role: 'USER' } });
    });

    describe('admin routes', () => {
        it('GET /api/v1/users 403 for a regular USER', async () => {
            const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(403);
            expect(repo.findAll).not.toHaveBeenCalled();
        });

        it('GET /api/v1/users 200 for ADMIN with pagination meta', async () => {
            repo.findAll.mockResolvedValue([admin, user]);

            const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toHaveLength(2);
            expect(res.body.meta.pagination.total).toBe(2);
        });

        it('GET /api/v1/users/:id 404 when not found', async () => {
            repo.findById.mockResolvedValue(null);

            const res = await request(app).get('/api/v1/users/missing').set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });

        it('PATCH /api/v1/users/:id/role promotes a user', async () => {
            repo.findById.mockResolvedValue(user);
            repo.updateRole.mockResolvedValue({ ...user, role: 'ADMIN' });

            const res = await request(app)
                .patch(`/api/v1/users/${user.id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'ADMIN' });

            expect(res.status).toBe(200);
            expect(res.body.role).toBe('ADMIN');
            expect(repo.updateRole).toHaveBeenCalledWith(user.id, 'ADMIN');
        });

        it('PATCH /api/v1/users/:id/role 400 for an unknown role', async () => {
            const res = await request(app)
                .patch(`/api/v1/users/${user.id}/role`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'GOD' });

            expect(res.status).toBe(400);
        });
    });

    it('404 with standard error shape for unknown routes', async () => {
        const res = await request(app).get('/nope');

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 'HTTP.NOT_FOUND', message: 'Cannot GET /nope' });
    });

    it('500 without leaking internals when the repository fails', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        repo.findByEmail.mockRejectedValue(new Error('db down'));

        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'juan@test.com', password: 'password123' });

        expect(res.status).toBe(500);
        expect(res.body).toMatchObject({ code: 'INTERNAL.UNEXPECTED', message: 'Internal server error' });
        spy.mockRestore();
    });
});
