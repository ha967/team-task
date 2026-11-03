import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PASSWORD_SALT_ROUNDS = 12;

// 所有对外返回的用户数据都走这里，passwordHash 永远不出现在响应里
const USER_SAFE_SELECT = {
    id: true,
    username: true,
    email: true,
    avatarUrl: true,
    createdAt: true,
} satisfies Prisma.UserSelect;

export interface CreateUserData {
    email: string;
    username: string;
    password: string;
}

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) {}

    /**
     * 根据 ID 查找用户（不含密码）用于/users/me
     * @param id
     * @returns { id: string; username: string; email: string; avatarUrl: string | null; createdAt: Date } | null
     */
    async findById(id: string) {
        return this.prismaService.user.findFirst({
            where: { id, deletedAt: null },
            select: USER_SAFE_SELECT,
        });
    }

    /**
     * 根据邮箱查找用户（不含密码）用于注册查重
     * @param email
     * @returns { id: string; username: string; email: string; avatarUrl: string | null; createdAt: Date } | null
     */
    async findByEmail(email: string) {
        return this.prismaService.user.findFirst({
            where: { email: normalizeEmail(email), deletedAt: null },
            select: USER_SAFE_SELECT,
        });
    }

    /**
     *  根据用户名查找用户（不含密码）用于注册查重
     * @param username
     * @returns { id: string; username: string; email: string; avatarUrl: string | null; createdAt: Date } | null
     */
    async findByUsername(username: string) {
        return this.prismaService.user.findFirst({
            where: { username, deletedAt: null },
            select: USER_SAFE_SELECT,
        });
    }

    /**
     * 根据邮箱查找用户（含密码）用，仅用于登录校验。方法名带 WithPassword 是为了让调用点一眼看出风险
     * @param email
     * @returns { id: string; username: string; email: string; avatarUrl: string | null; createdAt: Date; passwordHash: string } | null
     */
    async findByEmailWithPassword(email: string) {
        return this.prismaService.user.findFirst({
            where: { email: normalizeEmail(email), deletedAt: null },
            select: {
                ...USER_SAFE_SELECT,
                passwordHash: true,
            },
        });
    }

    /**
     * 创建用户时统一哈希密码，避免调用方漏掉
     * @param data
     * @returns { id: string; username: string; email: string; avatarUrl: string | null; createdAt: Date } | null
     */
    async create(data: CreateUserData) {
        const email = normalizeEmail(data.email);

        // 先查一次是为了给出字段级提示；并发场景由下面的唯一约束兜底。
        // 注意这里不过滤 deletedAt：唯一索引包含已软删除的行，过滤了反而和数据库不一致
        const [emailTaken, usernameTaken] = await Promise.all([
            this.prismaService.user.findFirst({
                where: { email },
                select: { id: true },
            }),
            this.prismaService.user.findFirst({
                where: { username: data.username },
                select: { id: true },
            }),
        ]);

        if (emailTaken) {
            throw new ConflictException('该邮箱已被注册');
        }

        if (usernameTaken) {
            throw new ConflictException('该用户名已被占用');
        }

        const passwordHash = await bcrypt.hash(
            data.password,
            PASSWORD_SALT_ROUNDS,
        );

        try {
            return await this.prismaService.user.create({
                data: {
                    email,
                    username: data.username,
                    passwordHash,
                },
                select: USER_SAFE_SELECT,
            });
        } catch (error) {
            throw mapUniqueConflict(error);
        }
    }
}

// 邮箱统一小写存储，避免 Alice@x.com 和 alice@x.com 变成两个账号
function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

// Prisma 7 走 driver adapter 后，唯一冲突的字段信息不在 meta.target 里，
// 而是在 meta.driverAdapterError.cause.constraint.index（如 users_email_key）
function extractUniqueTargets(
    error: Prisma.PrismaClientKnownRequestError,
): string[] {
    const meta = error.meta as
        | {
              target?: unknown;
              driverAdapterError?: {
                  cause?: {
                      constraint?: { index?: string };
                      originalMessage?: string;
                  };
              };
          }
        | undefined;

    const target = meta?.target;

    if (Array.isArray(target)) {
        return target.filter(
            (value): value is string => typeof value === 'string',
        );
    }

    if (typeof target === 'string') {
        return [target];
    }

    const cause = meta?.driverAdapterError?.cause;
    const hint = `${cause?.constraint?.index ?? ''} ${
        cause?.originalMessage ?? ''
    }`;
    const fields: string[] = [];

    if (hint.includes('email')) {
        fields.push('email');
    }

    if (hint.includes('username')) {
        fields.push('username');
    }

    return fields;
}

function mapUniqueConflict(error: unknown) {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
    ) {
        const fields = extractUniqueTargets(error);

        if (fields.includes('email')) {
            return new ConflictException('该邮箱已被注册');
        }

        if (fields.includes('username')) {
            return new ConflictException('该用户名已被占用');
        }

        return new ConflictException('用户已存在');
    }

    return error;
}
