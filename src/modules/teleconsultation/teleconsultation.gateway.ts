import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server as SocketServer, Socket as SocketClient } from 'socket.io';
import {
  Logger,
  UnauthorizedException,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { SosStatus } from '@prisma/client';
import * as crypto from 'crypto';
import {
  AnswerDto,
  EndCallDto,
  IceCandidateDto,
  JoinRoomDto,
  OfferDto,
  SendMessageDto,
  SosAcceptDto,
  SosRequestDto,
} from './dto/events.dto';
import { WsRateLimiter } from './ws-rate-limiter.service';
import { WsErrorFilter } from './ws-error.filter';

// Per-event budgets. WebRTC handshakes can chatter (offer + answer + many
// ICE candidates), so rtc bucket is generous. Chat is a human typing limit.
// SOS is one-per-minute to stop accidental panic-spam.
const RATE_LIMITS = {
  joinRoom:    { limit: 20,  windowSec: 60 },
  sendMessage: { limit: 30,  windowSec: 60 },
  sosRequest:  { limit: 1,   windowSec: 60 },
  sosAccept:   { limit: 30,  windowSec: 60 },
  doctorReady: { limit: 10,  windowSec: 60 },
  rtc:         { limit: 200, windowSec: 60 }, // shared by offer/answer/ice
  endCall:     { limit: 10,  windowSec: 60 },
} as const;

// ValidationPipe variant that throws WsException so the global ws filter
// turns it into an `error` event instead of an HTTP-style response. Same
// rules as the HTTP pipe in main.ts: whitelist + forbidNonWhitelisted +
// transform.
const wsValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: (errors) => {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .filter(Boolean)
      .join(' | ');
    return new WsException(messages || 'Invalid payload');
  },
});

interface AuthUser {
  id: string;
  role: string;
  // JWT issued-at (seconds since epoch). Cached so we can reject a socket
  // whose JWT was invalidated by a later password change without forcing
  // every event to re-decode the token.
  iat: number;
}

interface ChatMessagePayload {
  id: string;
  senderId: string;        // user.id, stable across socket reconnect
  senderName: string;
  content: string;
  timestamp: string;       // ISO 8601 UTC
}

interface ServerToClientEvents {
  // Emitted once after handleConnection finishes its DB auth check. The
  // built-in `connect` event fires on the client BEFORE this finishes (it
  // resolves on socket.io handshake), so there's a small race window where
  // the client could emit a handler event while client.data is still
  // undefined. FE should wait for `ready` (not `connect`) before emitting
  // joinRoom / sosRequest / etc.
  ready: () => void;
  error: (message: string) => void;
  // Notify other participants when a peer's connection drops, regardless
  // of why. Use user.id (stable) instead of socket.id (changes on reconnect).
  peerDisconnected: (data: { userId: string }) => void;
  userJoined: (data: { userId: string }) => void;
  sosDispatched: (data: {
    sosRoomId: string;
    patientId: string;
    patientName: string;
    description: string;
  }) => void;
  sosAccepted: (data: {
    roomId: string;
    doctorId: string;
    doctorName: string;
  }) => void;
  sosNoDoctor: () => void;
  offer: (data: { offer: unknown; senderId: string }) => void;
  answer: (data: { answer: unknown; senderId: string }) => void;
  iceCandidate: (data: { candidate: unknown; senderId: string }) => void;
  newMessage: (data: ChatMessagePayload) => void;
  // Sent right after joinRoom succeeds — last 50 messages of this room.
  // Empty array if no chat yet. Lets a reload-the-tab user see the same
  // transcript as someone who's been there the whole time.
  messageHistory: (data: { messages: ChatMessagePayload[] }) => void;
  callEnded: () => void;
}

interface ClientToServerEvents {
  joinRoom: (data: { appointmentCode: string }) => void;
  doctorReady: () => void;
  sosRequest: (data: { description: string }) => void;
  sosAccept: (data: { roomId: string }) => void;
  offer: (data: { offer: unknown; roomId: string }) => void;
  answer: (data: { answer: unknown; roomId: string }) => void;
  iceCandidate: (data: { candidate: unknown; roomId: string }) => void;
  sendMessage: (data: { roomId: string; content: string }) => void;
  endCall: (data: { roomId: string; reason?: string }) => void;
}

type StrictServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  AuthUser
>;

type StrictSocket = SocketClient<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  AuthUser
>;

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  },
  namespace: '/teleconsultation',
})
@UsePipes(wsValidationPipe)
@UseFilters(new WsErrorFilter())
export class TeleconsultationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: StrictServer;

  private readonly logger = new Logger(TeleconsultationGateway.name);
  // Per-instance lookup: socketId → roomId. NOT shared across instances —
  // that's fine because socket.id is per-instance anyway.
  private readonly activeConnections = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rate: WsRateLimiter,
  ) {}

  // Re-validate the user against the DB before any sensitive event.
  // Catches the case where admin disabled the account or the user
  // rotated their password after this socket connected — without this,
  // a long-lived socket bypasses both checks indefinitely.
  // Returns true if still active, false (and disconnects) otherwise.
  private async assertActive(client: StrictSocket): Promise<boolean> {
    const cached = client.data;
    if (!cached) {
      client.emit('error', 'Not authenticated');
      client.disconnect(true);
      return false;
    }
    let user;
    try {
      user = await this.prisma.user.findUnique({
        where: { id: cached.id },
        select: { is_active: true, password_changed_at: true },
      });
    } catch {
      // Don't kick the user just because the DB blipped — let the event
      // proceed and fail naturally if it really matters.
      return true;
    }
    if (!user || !user.is_active) {
      client.emit('error', 'Account disabled');
      client.disconnect(true);
      return false;
    }
    if (user.password_changed_at && cached.iat) {
      const changedAtSec = Math.floor(
        user.password_changed_at.getTime() / 1000,
      );
      if (cached.iat <= changedAtSec) {
        client.emit('error', 'Token revoked');
        client.disconnect(true);
        return false;
      }
    }
    return true;
  }

  // Returns true if the user is within their quota for this event. Emits
  // an `error` event to the caller when over-budget so the FE can throttle
  // its UI (e.g. show "you're sending messages too fast").
  private async withinRate(
    client: StrictSocket,
    userId: string,
    bucket: keyof typeof RATE_LIMITS,
  ): Promise<boolean> {
    const cfg = RATE_LIMITS[bucket];
    const ok = await this.rate.hit(
      `ws:${userId}:${bucket}`,
      cfg.limit,
      cfg.windowSec,
    );
    if (!ok) {
      client.emit('error', `Rate limit exceeded for ${bucket}`);
    }
    return ok;
  }

  async handleConnection(client: StrictSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth as { token?: string } | undefined)?.token ??
        (() => {
          const raw = client.handshake.headers['authorization'];
          return raw && raw.startsWith('Bearer ') ? raw.slice(7) : undefined;
        })();
      if (!token) throw new UnauthorizedException('Missing token');

      const secret = this.config.get<string>('JWT_SECRET');
      if (!secret) throw new Error('JWT_SECRET not set');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          role: true,
          is_active: true,
          password_changed_at: true,
        },
      });
      if (!user || !user.is_active) throw new UnauthorizedException();

      // Same iat-vs-password_changed_at check as JwtStrategy. Without it
      // a socket connected before a password rotation stays alive forever.
      if (user.password_changed_at && payload.iat) {
        const changedAtSec = Math.floor(
          user.password_changed_at.getTime() / 1000,
        );
        if (payload.iat <= changedAtSec) {
          throw new UnauthorizedException('Token revoked');
        }
      }

      client.data = { id: user.id, role: user.role, iat: payload.iat ?? 0 };
      this.logger.log(`WS connected ${client.id} (user=${user.id})`);
      // Tell the client it can now safely emit handler events.
      client.emit('ready');
    } catch (e) {
      this.logger.warn(`WS auth failed: ${(e as Error).message}`);
      client.emit('error', 'Authentication failed');
      client.disconnect(true);
    }
  }

  // ---- Public helpers used by TeleconsultationController -----------------

  // Snapshot for the /teleconsultation/health endpoint. Per-instance only;
  // multi-instance deploys would need a shared store to aggregate.
  activeSocketCount(): number {
    return this.activeConnections.size;
  }

  // Admin force-end. Broadcasts `callEnded` to the appointment's room +
  // stamps call_ended_at. Idempotent.
  async forceEndCall(
    appointmentId: string,
  ): Promise<{ message: string; appointment_code: string | null }> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { appointment_code: true },
    });
    if (!appt) {
      return { message: 'Appointment not found', appointment_code: null };
    }
    await this.prisma.appointment.updateMany({
      where: { id: appointmentId, call_ended_at: null },
      data: { call_ended_at: new Date() },
    });
    this.server.to(appt.appointment_code).emit('callEnded');
    return {
      message: 'Call ended for this appointment',
      appointment_code: appt.appointment_code,
    };
  }

  async handleDisconnect(client: StrictSocket): Promise<void> {
    const userId = client.data?.id;
    const roomId = this.activeConnections.get(client.id);
    if (roomId && userId) {
      // Notify the remaining peer with the stable user.id so reconnect
      // logic on the client side can match it back.
      client.to(roomId).emit('peerDisconnected', { userId });
      this.activeConnections.delete(client.id);
    }
    // Cancel any WAITING SOS this socket was the patient of (so doctors
    // don't see ghost rows). ACCEPTED rows survive — the appointment is
    // already created and the doctor may reconnect.
    if (userId) {
      try {
        await this.prisma.sosCall.updateMany({
          where: {
            patient_socket_id: client.id,
            status: SosStatus.WAITING,
          },
          data: { status: SosStatus.CANCELLED },
        });
      } catch (err) {
        this.logger.warn(
          `SOS cancel on disconnect failed: ${(err as Error).message}`,
        );
      }
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    if (!(await this.assertActive(client))) return;
    const user = client.data!;
    if (!(await this.withinRate(client, user.id, 'joinRoom'))) return;

    const code = data.appointmentCode;
    let appointment;
    try {
      appointment = await this.prisma.appointment.findUnique({
        where: { appointment_code: code },
        include: {
          patient: { include: { profile: { select: { user_id: true } } } },
          doctor: { include: { profile: { select: { user_id: true } } } },
        },
      });
    } catch (err) {
      this.logger.error(
        `joinRoom DB lookup failed: ${(err as Error).message}`,
      );
      client.emit('error', 'Server error, please retry');
      return;
    }

    if (!appointment || appointment.appointment_type === 'OFFLINE') {
      client.emit('error', 'Room not found or invalid');
      return;
    }

    // Block joining rooms for appointments that are not currently live.
    // CANCELLED / COMPLETED / NO_SHOW / PENDING must not open a call room.
    if (
      appointment.status !== 'CONFIRMED' &&
      appointment.status !== 'IN_PROGRESS'
    ) {
      client.emit(
        'error',
        `Room is not active (appointment status: ${appointment.status})`,
      );
      return;
    }

    // "Same day" check in Vietnam time (UTC+7). Bare-UTC comparison
    // breaks around midnight VN: at 23:30 7-May VN it's already 8-May
    // UTC, so an appointment booked for 7-May would be rejected.
    // Solution: shift `now` forward by +7h before extracting the day,
    // and compare against the day-portion of the stored appointment_date
    // (which is already a date-only column in DB, treated as VN day).
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const nowVn = new Date(Date.now() + VN_OFFSET_MS);
    const todayKey = nowVn.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const apptKey = appointment.appointment_date.toISOString().slice(0, 10);
    if (apptKey !== todayKey) {
      client.emit('error', 'Room only opens on the scheduled day');
      return;
    }

    const patientUserId = appointment.patient.profile?.user_id;
    const doctorUserId = appointment.doctor.profile?.user_id;
    const isPatient = patientUserId === user.id;
    const isDoctor = doctorUserId === user.id;
    this.logger.log(
      `joinRoom code=${code} jwt_user=${user.id} role=${user.role} ` +
        `patient_user=${patientUserId} doctor_user=${doctorUserId} ` +
        `isPatient=${isPatient} isDoctor=${isDoctor}`,
    );
    if (!isPatient && !isDoctor) {
      client.emit('error', 'You are not a participant of this appointment');
      return;
    }

    await client.join(data.appointmentCode);
    this.activeConnections.set(client.id, data.appointmentCode);
    client.broadcast
      .to(data.appointmentCode)
      .emit('userJoined', { userId: user.id });

    // Replay the last 50 messages so a reload-tab user catches up. Newest
    // first in DB, but FE expects oldest-first → reverse before sending.
    try {
      const recent = await this.prisma.chatMessage.findMany({
        where: { appointment_id: appointment.id },
        orderBy: { created_at: 'desc' },
        take: 50,
      });
      const history: ChatMessagePayload[] = recent
        .reverse()
        .map((m) => ({
          id: m.id,
          senderId: m.sender_user_id,
          senderName: '',
          content: m.content,
          timestamp: m.created_at.toISOString(),
        }));
      // senderName isn't stored — resolve names in 1 query if there's any.
      if (history.length > 0) {
        const ids = [...new Set(history.map((h) => h.senderId))];
        const profiles = await this.prisma.profile.findMany({
          where: { user_id: { in: ids } },
          select: { user_id: true, full_name: true },
        });
        const nameMap = new Map(profiles.map((p) => [p.user_id, p.full_name]));
        for (const h of history) {
          h.senderName = nameMap.get(h.senderId) ?? 'Unknown';
        }
      }
      client.emit('messageHistory', { messages: history });
    } catch (err) {
      this.logger.warn(
        `Failed to replay chat history: ${(err as Error).message}`,
      );
      client.emit('messageHistory', { messages: [] });
    }
  }

  @SubscribeMessage('doctorReady')
  async handleDoctorReady(
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    if (!(await this.assertActive(client))) return;
    if (client.data?.role !== 'DOCTOR') {
      client.emit('error', 'Only doctors can go on emergency standby');
      return;
    }
    if (!(await this.withinRate(client, client.data.id, 'doctorReady'))) return;
    await client.join('emergency-ward');
    this.logger.log(`Doctor ${client.data.id} joined emergency ward`);
  }

  @SubscribeMessage('sosRequest')
  async handleSosRequest(
    @MessageBody() data: SosRequestDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    if (!(await this.assertActive(client))) return;
    const user = client.data!;
    if (user.role !== 'PATIENT') {
      client.emit('error', 'Only patients can trigger SOS');
      return;
    }
    if (!(await this.withinRate(client, user.id, 'sosRequest'))) return;

    let profile;
    try {
      profile = await this.prisma.profile.findUnique({
        where: { user_id: user.id },
        select: { full_name: true, patientDetails: { select: { id: true } } },
      });
    } catch (err) {
      this.logger.warn(
        `sosRequest profile lookup failed: ${(err as Error).message}`,
      );
      client.emit('error', 'Server error, please retry');
      return;
    }
    if (!profile?.patientDetails) {
      client.emit('error', 'Patient profile not found');
      return;
    }

    // Random hex suffix → no chance of collision when 2 patients SOS in
    // the same millisecond (the old `Date.now()` pattern could collide).
    const sosRoomId = `SOS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    try {
      await this.prisma.sosCall.create({
        data: {
          room_id: sosRoomId,
          patient_user_id: user.id,
          patient_name: profile.full_name,
          patient_socket_id: client.id,
          description: data.description,
          status: SosStatus.WAITING,
        },
      });
    } catch (err) {
      this.logger.error(
        `sosRequest create failed: ${(err as Error).message}`,
      );
      client.emit('error', 'Failed to create SOS');
      return;
    }

    this.server.to('emergency-ward').emit('sosDispatched', {
      sosRoomId,
      patientId: profile.patientDetails.id,
      patientName: profile.full_name,
      description: data.description,
    });
    this.logger.warn(`SOS ${sosRoomId} from patient ${profile.full_name}`);
  }

  @SubscribeMessage('sosAccept')
  async handleSosAccept(
    @MessageBody() data: SosAcceptDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    if (!(await this.assertActive(client))) return;
    const user = client.data!;
    if (user.role !== 'DOCTOR') {
      client.emit('error', 'Only doctors can accept SOS');
      return;
    }
    if (!(await this.withinRate(client, user.id, 'sosAccept'))) return;

    // Atomic claim: only the first doctor that flips WAITING → ACCEPTED
    // wins. Concurrent accepts get count=0 and bail out gracefully.
    let claim: { count: number };
    try {
      claim = await this.prisma.sosCall.updateMany({
        where: { room_id: data.roomId, status: SosStatus.WAITING },
        data: {
          status: SosStatus.ACCEPTED,
          doctor_user_id: user.id,
          accepted_at: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `sosAccept atomic claim failed: ${(err as Error).message}`,
      );
      client.emit('error', 'Server error, please retry');
      return;
    }
    if (claim.count === 0) {
      client.emit('error', 'SOS already accepted by another doctor');
      return;
    }

    // We won the race. Now resolve profiles + create the EMERGENCY
    // appointment + link it back to the SOS row. If anything below fails
    // we roll the SOS row back to WAITING so another doctor can pick up.
    let doctorProfile, patientUserId, patientName, patientSocketId;
    try {
      const sos = await this.prisma.sosCall.findUnique({
        where: { room_id: data.roomId },
      });
      if (!sos) throw new Error('SOS row vanished after claim');
      patientUserId = sos.patient_user_id;
      patientName = sos.patient_name;
      patientSocketId = sos.patient_socket_id;

      doctorProfile = await this.prisma.profile.findUnique({
        where: { user_id: user.id },
        select: { full_name: true, doctorDetails: { select: { id: true } } },
      });
      const patientProfile = await this.prisma.profile.findUnique({
        where: { user_id: patientUserId },
        select: { patientDetails: { select: { id: true } } },
      });
      if (!doctorProfile?.doctorDetails || !patientProfile?.patientDetails) {
        throw new Error('Profile resolution failed');
      }

      const now = new Date();
      const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

      const appt = await this.prisma.appointment.create({
        data: {
          appointment_code: data.roomId,
          patient_id: patientProfile.patientDetails.id,
          doctor_id: doctorProfile.doctorDetails.id,
          appointment_type: 'EMERGENCY',
          appointment_date: now,
          start_time: hhmm,
          end_time: '23:59',
          status: 'IN_PROGRESS',
          meeting_url: `/teleconsultation/room/${data.roomId}`,
          patient_note: `[SOS] ${patientName}`,
        },
        select: { id: true },
      });
      await this.prisma.sosCall.update({
        where: { room_id: data.roomId },
        data: { appointment_id: appt.id },
      });
    } catch (err) {
      this.logger.error(
        `sosAccept post-claim failed, rolling back: ${(err as Error).message}`,
      );
      // Roll back the SOS row so another doctor can claim it.
      await this.prisma.sosCall
        .updateMany({
          where: { room_id: data.roomId, status: SosStatus.ACCEPTED },
          data: {
            status: SosStatus.WAITING,
            doctor_user_id: null,
            accepted_at: null,
          },
        })
        .catch(() => undefined);
      client.emit('error', 'Failed to record SOS appointment');
      return;
    }

    await client.join(data.roomId);
    // Socket.IO v4 namespace API: `this.server` IS the namespace (because
    // the gateway is mounted at `/teleconsultation`), so `this.server.sockets`
    // is already the Map<id, Socket> of clients in this namespace.
    try {
      // The decorator-typed `StrictServer` claims `this.server` is a Server,
      // but at runtime it's the namespace bound to `/teleconsultation` — and
      // its `.sockets` is a Map<SocketId, Socket>. Cast to read it.
      const sockMap = (
        this.server as unknown as { sockets: Map<string, StrictSocket> }
      ).sockets;
      const patientSocket = sockMap?.get(patientSocketId);
      if (patientSocket) {
        await patientSocket.join(data.roomId);
        this.activeConnections.set(patientSocket.id, data.roomId);
      }
    } catch (err) {
      this.logger.warn(
        `Patient socket join failed: ${(err as Error).message}`,
      );
    }
    this.activeConnections.set(client.id, data.roomId);

    this.server.to(data.roomId).emit('sosAccepted', {
      roomId: data.roomId,
      doctorId: doctorProfile.doctorDetails!.id,
      doctorName: doctorProfile.full_name,
    });
  }

  @SubscribeMessage('offer')
  async handleOffer(
    @MessageBody() data: OfferDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    const user = client.data;
    if (!user) return;
    if (this.activeConnections.get(client.id) !== data.roomId) return;
    if (!(await this.withinRate(client, user.id, 'rtc'))) return;
    client.broadcast
      .to(data.roomId)
      .emit('offer', { offer: data.offer, senderId: user.id });
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @MessageBody() data: AnswerDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    const user = client.data;
    if (!user) return;
    if (this.activeConnections.get(client.id) !== data.roomId) return;
    if (!(await this.withinRate(client, user.id, 'rtc'))) return;
    client.broadcast
      .to(data.roomId)
      .emit('answer', { answer: data.answer, senderId: user.id });
  }

  @SubscribeMessage('iceCandidate')
  async handleIceCandidate(
    @MessageBody() data: IceCandidateDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    const user = client.data;
    if (!user) return;
    if (this.activeConnections.get(client.id) !== data.roomId) return;
    if (!(await this.withinRate(client, user.id, 'rtc'))) return;
    client.broadcast.to(data.roomId).emit('iceCandidate', {
      candidate: data.candidate,
      senderId: user.id,
    });
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() data: SendMessageDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    const user = client.data;
    if (!user) return;
    if (this.activeConnections.get(client.id) !== data.roomId) return;
    if (!(await this.withinRate(client, user.id, 'sendMessage'))) return;

    // Resolve room → appointment id for the FK. Cache lookup wouldn't be
    // worth it: chat traffic is low (a few msgs per call).
    const appointment = await this.prisma.appointment
      .findUnique({
        where: { appointment_code: data.roomId },
        select: { id: true },
      })
      .catch(() => null);
    if (!appointment) {
      client.emit('error', 'Room not found');
      return;
    }

    let senderName = 'Unknown';
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { user_id: user.id },
        select: { full_name: true },
      });
      if (profile?.full_name) senderName = profile.full_name;
    } catch (err) {
      this.logger.warn(
        `sendMessage profile lookup failed: ${(err as Error).message}`,
      );
    }

    let saved: { id: string; created_at: Date };
    try {
      saved = await this.prisma.chatMessage.create({
        data: {
          appointment_id: appointment.id,
          sender_user_id: user.id,
          content: data.content,
        },
        select: { id: true, created_at: true },
      });
    } catch (err) {
      this.logger.error(
        `sendMessage persist failed: ${(err as Error).message}`,
      );
      client.emit('error', 'Failed to save message');
      return;
    }

    this.server.to(data.roomId).emit('newMessage', {
      id: saved.id,
      senderId: user.id,
      senderName,
      content: data.content,
      timestamp: saved.created_at.toISOString(),
    });
  }

  @SubscribeMessage('endCall')
  async handleEndCall(
    @MessageBody() data: EndCallDto,
    @ConnectedSocket() client: StrictSocket,
  ): Promise<void> {
    const user = client.data;
    if (!user) return;
    if (this.activeConnections.get(client.id) !== data.roomId) return;
    if (!(await this.withinRate(client, user.id, 'endCall'))) return;

    // Stamp call_ended_at on the appointment if not already set. We do
    // NOT flip status to COMPLETED here — that's the doctor's explicit
    // action via POST /appointments/:id/complete (which writes the
    // medical record). Multiple endCall events from either side are
    // idempotent because of the `call_ended_at: null` filter.
    try {
      await this.prisma.appointment.updateMany({
        where: {
          appointment_code: data.roomId,
          call_ended_at: null,
        },
        data: { call_ended_at: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `endCall stamp failed for room=${data.roomId}: ${(err as Error).message}`,
      );
    }

    this.server.to(data.roomId).emit('callEnded');
  }
}
