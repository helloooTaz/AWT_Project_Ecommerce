import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Page } from '../../common/http/pagination';
import { User } from '../../database/entities';
import { hashPassword } from '../auth/password';
import {
  managedStaffRoles, type CreateStaffAccountDto, type StaffAccountQueryDto,
  type StaffAccountResponseDto, type UpdateStaffAccountDto,
} from './admin.dto';

@Injectable()
export class AdminService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async create(input: CreateStaffAccountDto): Promise<StaffAccountResponseDto> {
    const account = await this.users.save(this.users.create({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      isActive: true,
    }));
    return this.toResponse(account);
  }

  async list(query: StaffAccountQueryDto): Promise<Page<StaffAccountResponseDto>> {
    const [accounts, total] = await this.users.findAndCount({
      where: {
        role: query.role ?? In(managedStaffRoles),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      order: { name: 'ASC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(accounts.map((account) => this.toResponse(account)), total, query);
  }

  async get(id: string): Promise<StaffAccountResponseDto> {
    const account = await this.users.findOneBy({ id, role: In(managedStaffRoles) });
    if (!account) throw new NotFoundException('Managed account not found');
    return this.toResponse(account);
  }

  async update(id: string, input: UpdateStaffAccountDto): Promise<StaffAccountResponseDto> {
    if (!Object.keys(input).length) return this.get(id);

    const result = await this.users.update({ id, role: In(managedStaffRoles) }, input, {
      returning: ['id', 'name', 'email', 'role', 'isActive', 'createdAt', 'updatedAt'],
    });
    const [account]: StaffAccountResponseDto[] = result.raw;
    if (!account) throw new NotFoundException('Managed account not found');
    return account;
  }

  async deactivate(id: string): Promise<void> {
    const account = { id, role: In(managedStaffRoles) };
    const result = await this.users.update({ ...account, isActive: true }, { isActive: false });
    if (!result.affected && !(await this.users.existsBy(account))) {
      throw new NotFoundException('Managed account not found');
    }
  }

  private toResponse(account: User): StaffAccountResponseDto {
    const { id, name, email, role, isActive, createdAt, updatedAt } = account;
    return { id, name, email, role, isActive, createdAt, updatedAt };
  }
}
