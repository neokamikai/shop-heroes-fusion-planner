const nodemailer = require('nodemailer');

class EmailService {
  constructor({
    appBaseUrl,
    emailFromAddress,
    emailFromName,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPassword
  }) {
    this.appBaseUrl = appBaseUrl;
    this.emailFromAddress = emailFromAddress;
    this.emailFromName = emailFromName;
    this.smtpHost = smtpHost;
    this.smtpPort = smtpPort;
    this.smtpSecure = smtpSecure;
    this.smtpUser = smtpUser;
    this.smtpPassword = smtpPassword;
    this.transporter = this.buildTransporter();
  }

  buildTransporter() {
    if (!this.smtpHost || !this.smtpPort || !this.smtpUser || !this.smtpPassword) {
      return null;
    }

    return nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpSecure,
      auth: {
        user: this.smtpUser,
        pass: this.smtpPassword
      }
    });
  }

  async sendEmail({ to, subject, textBody, htmlBody, metadata = {} }) {
    if (!this.transporter) {
      console.log('[email-preview]', JSON.stringify({
        to,
        subject,
        metadata,
        textBody,
        htmlBody
      }));

      return {
        deliveryMode: 'preview'
      };
    }

    await this.transporter.sendMail({
      from: this.emailFromName
        ? `"${this.emailFromName}" <${this.emailFromAddress}>`
        : this.emailFromAddress,
      to,
      subject,
      text: textBody,
      html: htmlBody
    });

    return {
      deliveryMode: 'smtp'
    };
  }
}

module.exports = {
  EmailService
};
