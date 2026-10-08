import { EncryptPassword } from '../components/encrypt.password';
import { JwtToken } from '../components/jwt.token';
import { AuthResponseDto } from '../dto/auth.response.dto';
import { CreateUserDto } from '../dto/create.user.dto';
import { LoginUserDto } from '../dto/login.user.dto';
import { UserDto } from '../dto/user.dto';
import { HttpError } from '../errors/http.error';
import { EventPublisher, NoopEventPublisher } from '../messaging/event.publisher';
import { buildUserRegisteredEvent, RoutingKeys } from '../messaging/events';
import { Role, UserModel } from '../models/user.model';
import { UserRepository } from '../repositories/user.repository';

export class UserService {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly eventPublisher: EventPublisher = new NoopEventPublisher(),
    ) {}

    async register(newUser: CreateUserDto): Promise<UserDto> {
        const email = newUser.email.trim().toLowerCase();

        const existing = await this.userRepository.findByEmail(email);
        if (existing) {
            throw HttpError.conflict('Email is already registered');
        }

        const hashedPassword = await EncryptPassword.hashPassword(newUser.password);

        // Public registration always creates a regular USER; roles are elevated by an ADMIN.
        const user = await this.userRepository.create({ email, password: hashedPassword });
        await this.publishUserRegistered(user);

        return UserDto.fromModel(user);
    }

    async login(loginData: LoginUserDto): Promise<AuthResponseDto> {
        const email = loginData.email.trim().toLowerCase();
        const user = await this.userRepository.findByEmail(email);

        const validPassword = user
            ? await EncryptPassword.comparePassword(loginData.password, user.password)
            : false;

        if (!user || !validPassword) {
            throw HttpError.unauthorized('Invalid email or password');
        }

        const accessToken = JwtToken.sign({ sub: user.id, email: user.email, role: user.role });

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: JwtToken.expiresInSeconds,
            user: UserDto.fromModel(user),
        };
    }

    async findById(id: string): Promise<UserDto> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw HttpError.notFound('User not found');
        }
        return UserDto.fromModel(user);
    }

    async findAll(): Promise<UserDto[]> {
        const users = await this.userRepository.findAll();
        return users.map(UserDto.fromModel);
    }

    async updateRole(id: string, role: Role): Promise<UserDto> {
        await this.findById(id);
        const user = await this.userRepository.updateRole(id, role);
        return UserDto.fromModel(user);
    }

    // The user is already persisted: a broker outage must not fail the registration.
    private async publishUserRegistered(user: UserModel): Promise<void> {
        const event = buildUserRegisteredEvent(user);
        try {
            await this.eventPublisher.publish(RoutingKeys.userRegistered, event);
        } catch (err) {
            console.error(`Failed to publish ${event.eventType} for user ${user.id}:`, (err as Error).message);
        }
    }
}
