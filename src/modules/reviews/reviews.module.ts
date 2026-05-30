import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PrismaModule } from '../../prisma/prisma.module'; // 👉 Nhớ trỏ đúng về folder Prisma của em

@Module({
  imports: [PrismaModule], // Inject Prisma để ReviewsService có thể dùng Database
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService], // Export nếu sau này muốn dùng Review ở module khác
})
export class ReviewsModule {}
