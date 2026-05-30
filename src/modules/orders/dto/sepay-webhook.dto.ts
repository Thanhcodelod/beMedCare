import { IsInt, IsOptional, IsString } from 'class-validator';

// Payload thực tế SePay gửi (xem https://docs.sepay.vn/tich-hop-webhooks.html).
// Backend chỉ thực sự dùng `id`, `content`, `transferAmount`, `transferType`,
// nhưng phải khai báo cả các field còn lại — global ValidationPipe có
// `forbidNonWhitelisted: true` sẽ 400 nếu thấy field "lạ".
export class SepayWebhookDto {
  @IsInt()
  id: number;

  @IsString()
  content: string;

  @IsInt()
  transferAmount: number;

  // "in" = incoming (what we want). "out" = outgoing — we ignore.
  @IsString()
  transferType: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsString()
  transactionDate?: string;

  // Các field SePay gửi kèm nhưng chúng ta không xử lý — khai báo để
  // qua được ValidationPipe (forbidNonWhitelisted).
  @IsOptional()
  subAccount?: string | null;

  @IsOptional()
  code?: string | null;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  accumulated?: number;
}
