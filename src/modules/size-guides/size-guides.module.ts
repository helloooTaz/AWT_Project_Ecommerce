import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../catalog/entities/product.entity';
import { SizeGuideRange } from './entities/size-guide-range.entity';
import { SizeGuide } from './entities/size-guide.entity';
import { SizeGuidesController } from './size-guides.controller';
import { SizeGuidesService } from './size-guides.service';
import { StaffSizeGuidesController } from './staff-size-guides.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SizeGuide, SizeGuideRange, Product])],
  controllers: [SizeGuidesController, StaffSizeGuidesController],
  providers: [SizeGuidesService],
  exports: [SizeGuidesService],
})
export class SizeGuidesModule {}
