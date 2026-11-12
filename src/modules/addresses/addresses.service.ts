import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestValidationException } from '../../common/pipes/request-validation.pipe';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { ListAddressesQueryDto } from './dto/list-addresses-query.dto';
import type { UpdateAddressDto } from './dto/update-address.dto';
import { Address } from './entities/address.entity';

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
  ) {}

  create(userId: string, input: CreateAddressDto) {
    return this.addresses.save(this.addresses.create({ ...input, userId }));
  }

  async list(userId: string, { page, limit }: ListAddressesQueryDto) {
    const [addresses, total] = await this.addresses.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      addresses,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(userId: string, id: string) {
    const address = await this.addresses.findOneBy({ id, userId });
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    return address;
  }

  async update(userId: string, id: string, input: UpdateAddressDto) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new RequestValidationException([
        { field: 'body', message: 'At least one address field is required' },
      ]);
    }
    return this.addresses.manager.transaction(async (manager) => {
      const addresses = manager.getRepository(Address);
      const { affected } = await addresses.update({ id, userId }, input);
      if (!affected) {
        throw new NotFoundException('Address not found');
      }
      return addresses.findOneByOrFail({ id, userId });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const { affected } = await this.addresses.delete({ id, userId });
    if (!affected) {
      throw new NotFoundException('Address not found');
    }
  }
}
