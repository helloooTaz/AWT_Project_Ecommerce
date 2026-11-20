import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Page, type PageQueryDto } from '../../common/http/pagination';
import { Address } from '../../database/entities';
import type { AddressResponseDto, CreateAddressDto, UpdateAddressDto } from './customer.dto';

@Injectable()
export class AddressService {
  constructor(@InjectRepository(Address) private readonly addresses: Repository<Address>) {}

  async create(userId: string, input: CreateAddressDto): Promise<AddressResponseDto> {
    const address = await this.addresses.save(this.addresses.create({
      ...input,
      line2: input.line2 ?? null,
      userId,
    }));
    return this.toResponse(address);
  }

  async list(userId: string, query: PageQueryDto): Promise<Page<AddressResponseDto>> {
    const [addresses, total] = await this.addresses.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(addresses.map((address) => this.toResponse(address)), total, query);
  }

  async get(userId: string, id: string): Promise<AddressResponseDto> {
    const address = await this.addresses.findOneBy({ id, userId });
    if (!address) throw new NotFoundException('Address not found');
    return this.toResponse(address);
  }

  async update(userId: string, id: string, input: UpdateAddressDto): Promise<AddressResponseDto> {
    if (!Object.keys(input).length) return this.get(userId, id);

    const result = await this.addresses.update({ id, userId }, input, { returning: '*' });
    const [address]: Address[] = result.raw;
    if (!address) throw new NotFoundException('Address not found');
    return this.toResponse(address);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.addresses.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('Address not found');
  }

  private toResponse(address: Address): AddressResponseDto {
    const {
      id, recipientName, phone, line1, line2, city, postalCode, countryCode, createdAt, updatedAt,
    } = address;
    return {
      id, recipientName, phone, line1, line2, city, postalCode, countryCode, createdAt, updatedAt,
    };
  }
}
