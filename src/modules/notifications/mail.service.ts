import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Minimal HTML escape for user-supplied strings interpolated into templates.
// Anything that reaches `html:` must pass through this — reminder/prescription
// emails embed doctor-entered diagnoses and patient names that could otherwise
// inject tags.
function escapeHtml(input: string): string {
  return input.replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch] ?? ch,
  );
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter!: nodemailer.Transporter;
  private fromAddress = 'no-reply@telemedicine.local';
  private frontendBaseUrl = 'http://localhost:3001';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = parseInt(this.config.get<string>('SMTP_PORT') ?? '587', 10);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.fromAddress = user ?? this.fromAddress;
    this.frontendBaseUrl =
      this.config.get<string>('FRONTEND_BASE_URL') ?? this.frontendBaseUrl;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendReminderEmail(
    toEmail: string,
    patientName: string,
    time: string,
    meetingUrl: string,
  ): Promise<void> {
    const safeName = escapeHtml(patientName);
    const safeTime = escapeHtml(time);
    const safeUrl = escapeHtml(`${this.frontendBaseUrl}${meetingUrl}`);
    try {
      await this.transporter.sendMail({
        from: `"Telemedicine" <${this.fromAddress}>`,
        to: toEmail,
        subject: 'Reminder: your online consultation is starting soon',
        html: `
          <h3>Hello ${safeName},</h3>
          <p>You have an upcoming online consultation at <strong>${safeTime}</strong>.</p>
          <p>
            <a href="${safeUrl}"
               style="padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;">
              Join Consultation
            </a>
          </p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send reminder email to ${toEmail}`,
        error as Error,
      );
      throw error;
    }
  }

  async sendPrescriptionEmail(
    toEmail: string,
    patientName: string,
    diagnosis: string,
    prescription: string,
  ): Promise<void> {
    const safeName = escapeHtml(patientName);
    const safeDiagnosis = escapeHtml(diagnosis);
    const safePrescription = escapeHtml(prescription);
    try {
      await this.transporter.sendMail({
        from: `"Telemedicine" <${this.fromAddress}>`,
        to: toEmail,
        subject: 'Your prescription from the doctor',
        html: `
          <h3>Hello ${safeName},</h3>
          <p>Your consultation has ended. Summary:</p>
          <div style="background:#f9f9f9;padding:15px;border-left:4px solid #007bff;">
            <p><strong>Diagnosis:</strong> ${safeDiagnosis}</p>
            <p><strong>Prescription:</strong> ${safePrescription}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send prescription email to ${toEmail}`,
        error as Error,
      );
      throw error;
    }
  }

  async sendPasswordResetEmail(
    toEmail: string,
    userName: string,
    resetUrl: string,
    expiresInMinutes: number,
  ): Promise<void> {
    // The URL contains the raw single-use token in a query param. We
    // do not log it.
    const safeName = escapeHtml(userName);
    const safeUrl = escapeHtml(resetUrl);
    try {
      await this.transporter.sendMail({
        from: `"Telemedicine" <${this.fromAddress}>`,
        to: toEmail,
        subject: 'Reset your password',
        html: `
          <h3>Hello ${safeName},</h3>
          <p>We received a request to reset your password. Click the button below to choose a new one:</p>
          <p>
            <a href="${safeUrl}"
               style="padding:12px 22px;background:#007bff;color:#fff;text-decoration:none;border-radius:4px;display:inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color:#555;font-size:13px;">
            This link expires in ${expiresInMinutes} minute(s) and can be used once.
            If you did not request a reset, you can safely ignore this email — no changes have been made.
          </p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password-reset email to ${toEmail}`,
        error as Error,
      );
      throw error;
    }
  }
}
