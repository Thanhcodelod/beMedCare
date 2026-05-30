import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { MailService } from './mail.service';

export interface NotificationJobData {
  email: string;
  patientName: string;
  time?: string;
  meetingUrl?: string;
  diagnosis?: string;
  prescription?: string;
  resetUrl?: string;
  expiresInMinutes?: number;
}

@Processor('reminder-queue')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<NotificationJobData, void, string>): Promise<void> {
    this.logger.log(`Processing job [${job.name}] for ${job.data.email}`);
    const data = job.data;

    switch (job.name) {
      case 'send-reminder':
        await this.mailService.sendReminderEmail(
          data.email,
          data.patientName,
          data.time as string,
          data.meetingUrl as string,
        );
        break;
      case 'send-prescription':
        await this.mailService.sendPrescriptionEmail(
          data.email,
          data.patientName,
          data.diagnosis as string,
          data.prescription as string,
        );
        break;
      case 'send-password-reset':
        await this.mailService.sendPasswordResetEmail(
          data.email,
          data.patientName,
          data.resetUrl as string,
          data.expiresInMinutes ?? 15,
        );
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return;
    }

    this.logger.log(`Completed job [${job.name}] for ${data.email}`);
  }
}
