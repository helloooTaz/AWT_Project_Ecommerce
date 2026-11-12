import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { successResponse } from '../../common/dto/success-response';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../roles/roles.decorator';
import { RolesGuard } from '../roles/roles.guard';
import { UserRole } from '../roles/user-role.enum';
import { AddressesService } from './addresses.service';
import { addressResponse } from './dto/address-response';
import { CreateAddressDto } from './dto/create-address.dto';
import { ListAddressesQueryDto } from './dto/list-addresses-query.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

const addressExample = {
  id: '6268504d-c404-4730-9abb-9e8bd527f06a',
  recipient: 'Samira Rahman',
  phone: '+8801712345678',
  addressLine1: 'House 12, Road 5',
  addressLine2: null,
  city: 'Dhaka',
  createdAt: '2026-11-12T08:00:00.000Z',
  updatedAt: '2026-11-12T08:00:00.000Z',
};
const exampleMeta = { requestId: '6f2d7ea0-6df8-41f5-a28a-493bdaed806d' };
const addressEnvelope = {
  success: true,
  message: 'OK',
  data: addressExample,
  meta: exampleMeta,
};

@ApiTags('Delivery addresses')
@ApiBearerAuth()
@ApiBadRequestResponse({
  description: 'Invalid address fields, ID or pagination',
})
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles([UserRole.CUSTOMER])
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Post()
  @ApiCreatedResponse({
    schema: { example: { ...addressEnvelope, message: 'Address created' } },
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateAddressDto,
  ) {
    return successResponse(
      addressResponse(await this.addresses.create(user.id, input)),
      'Address created',
    );
  }

  @Get()
  @ApiOkResponse({
    schema: {
      example: {
        ...addressEnvelope,
        data: [addressExample],
        meta: {
          ...exampleMeta,
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      },
    },
  })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAddressesQueryDto,
  ) {
    const { addresses, pagination } = await this.addresses.list(user.id, query);
    return successResponse(addresses.map(addressResponse), 'OK', pagination);
  }

  @Get(':id')
  @ApiOkResponse({ schema: { example: addressEnvelope } })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return successResponse(
      addressResponse(await this.addresses.get(user.id, id)),
    );
  }

  @Patch(':id')
  @ApiOkResponse({ schema: { example: addressEnvelope } })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateAddressDto,
  ) {
    return successResponse(
      addressResponse(await this.addresses.update(user.id, id, input)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Address deleted' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.addresses.remove(user.id, id);
  }
}
