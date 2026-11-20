import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse, ApiBearerAuth, ApiForbiddenResponse, ApiNoContentResponse,
  ApiNotFoundResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiDataResponse, ApiPageResponse } from '../../common/http/openapi';
import { Page, PageQueryDto } from '../../common/http/pagination';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { Role, type AuthenticatedUser } from '../auth/role';
import { AddressService } from './address.service';
import { AddressResponseDto, CreateAddressDto, UpdateAddressDto } from './customer.dto';

@ApiTags('Customer addresses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, or expired bearer token' })
@ApiForbiddenResponse({ description: 'Customer role required' })
@Roles(Role.Customer)
@Controller('addresses')
export class AddressController {
  constructor(private readonly addresses: AddressService) {}

  @Post()
  @ApiOperation({ summary: 'Create an address for the signed-in customer' })
  @ApiDataResponse(AddressResponseDto, HttpStatus.CREATED)
  @ApiBadRequestResponse({ description: 'Invalid address fields' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addresses.create(user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List addresses owned by the signed-in customer, newest first' })
  @ApiPageResponse(AddressResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid pagination query' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PageQueryDto,
  ): Promise<Page<AddressResponseDto>> {
    return this.addresses.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one address owned by the signed-in customer' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(AddressResponseDto)
  @ApiBadRequestResponse({ description: 'Address ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AddressResponseDto> {
    return this.addresses.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an address owned by the signed-in customer' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiDataResponse(AddressResponseDto)
  @ApiBadRequestResponse({ description: 'Invalid address fields or version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.addresses.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address owned by the signed-in customer' })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiNoContentResponse({ description: 'Address deleted' })
  @ApiBadRequestResponse({ description: 'Address ID must be a version 4 UUID' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.addresses.remove(user.id, id);
  }
}
