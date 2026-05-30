import {
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// Common: appointmentCode = "AP-YYYYMMDD-XXXXXXXX" (booking) or "SOS-..."
// (emergency room). Tolerate both with a permissive regex; exact lookup
// against DB is what enforces validity.
const ROOM_ID_REGEX = /^[A-Z0-9-]{4,64}$/i;

export class JoinRoomDto {
  @IsString()
  @Matches(ROOM_ID_REGEX, { message: 'appointmentCode format is invalid' })
  appointmentCode: string;
}

export class SosRequestDto {
  @IsString()
  @MaxLength(500)
  description: string;
}

export class SosAcceptDto {
  @IsString()
  @Matches(/^SOS-[A-F0-9]{8,}$/i, { message: 'roomId must be a SOS room' })
  roomId: string;
}

class RoomIdDto {
  @IsString()
  @Matches(ROOM_ID_REGEX, { message: 'roomId format is invalid' })
  roomId: string;
}

// WebRTC payloads. The inner `offer / answer / candidate` objects are SDP
// blobs whose exact shape comes from the browser's RTCPeerConnection — we
// don't validate their internal fields, but we DO require they exist and
// are JSON objects (rejects null/string/number).
export class OfferDto extends RoomIdDto {
  @IsDefined()
  @IsObject()
  offer: Record<string, unknown>;
}

export class AnswerDto extends RoomIdDto {
  @IsDefined()
  @IsObject()
  answer: Record<string, unknown>;
}

export class IceCandidateDto extends RoomIdDto {
  @IsDefined()
  @IsObject()
  candidate: Record<string, unknown>;
}

export class SendMessageDto extends RoomIdDto {
  // 2000 chars is plenty for chat. Anything bigger smells like abuse / paste
  // of an entire medical record — block it before broadcasting.
  @IsString()
  @MaxLength(2000)
  content: string;
}

export class EndCallDto extends RoomIdDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
