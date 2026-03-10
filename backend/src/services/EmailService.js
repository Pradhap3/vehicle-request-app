// src/services/EmailService.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const missingConfig = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM']
        .filter((key) => !process.env[key]);
      if (missingConfig.length > 0) {
        if (process.env.NODE_ENV !== 'production') {
          this.transporter = nodemailer.createTransport({
            jsonTransport: true
          });
          logger.warn(`Email env vars missing (${missingConfig.join(', ')}). Using dev jsonTransport fallback.`);
          this.initialized = true;
          return;
        }
        throw new Error(`Missing email env vars: ${missingConfig.join(', ')}`);
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        }
      });

      await this.transporter.verify();
      logger.info('Email service initialized successfully');
      this.initialized = true;
    } catch (error) {
      logger.warn(`Email service initialization failed: ${error.message}`);
      if (error.code || error.responseCode) {
        logger.warn(`Email service error code: ${error.code || error.responseCode}`);
      }
      logger.warn('Email notifications will be disabled');
      this.transporter = null;
      this.initialized = false;
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.transporter) {
      logger.warn('Email service not available, skipping email');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const mailOptions = {
        from: `"AISIN Cab Request Management" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return { success: false, error: error.message };
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  // Email templates
  getRequestConfirmationTemplate(data) {
    return {
      subject: `Cab Request Confirmed - ${data.route_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0f172a; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8fafc; }
            .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .label { font-weight: bold; color: #64748b; }
            .value { color: #0f172a; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>ðŸš— AISIN Cab Request Management</h1>
            </div>
            <div class="content">
              <h2>Your Cab Request is Confirmed!</h2>
              <div class="info-box">
                <p><span class="label">Route:</span> <span class="value">${data.route_name}</span></p>
                <p><span class="label">Pickup Time:</span> <span class="value">${data.pickup_time}</span></p>
                <p><span class="label">From:</span> <span class="value">${data.start_point}</span></p>
                <p><span class="label">To:</span> <span class="value">${data.end_point}</span></p>
                ${data.cab_number ? `<p><span class="label">Cab Number:</span> <span class="value">${data.cab_number}</span></p>` : ''}
                ${data.driver_name ? `<p><span class="label">Driver:</span> <span class="value">${data.driver_name}</span></p>` : ''}
                ${data.driver_phone ? `<p><span class="label">Driver Contact:</span> <span class="value">${data.driver_phone}</span></p>` : ''}
              </div>
              <p>Please be ready 5 minutes before the scheduled pickup time.</p>
            </div>
            <div class="footer">
              <p>AISIN Automotive Karnataka Pvt. Ltd. - Cab Request Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  getCabAssignmentTemplate(data) {
    return {
      subject: `Cab Assigned - ${data.cab_number}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0f172a; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8fafc; }
            .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .highlight { background: #dbeafe; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>ðŸš— AISIN Cab Request Management</h1>
            </div>
            <div class="content">
              <h2>Cab Assigned to Your Request</h2>
              <div class="highlight">
                <h3>Cab Details</h3>
                <p><strong>Cab Number:</strong> ${data.cab_number}</p>
                <p><strong>Driver:</strong> ${data.driver_name}</p>
                <p><strong>Contact:</strong> ${data.driver_phone}</p>
              </div>
              <div class="info-box">
                <p><strong>Pickup Time:</strong> ${data.pickup_time}</p>
                <p><strong>Route:</strong> ${data.route_name}</p>
              </div>
              <p>Please be at the pickup point 5 minutes early.</p>
            </div>
            <div class="footer">
              <p>AISIN Automotive Karnataka Pvt. Ltd. - Cab Request Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  getDelayNotificationTemplate(data) {
    return {
      subject: `âš ï¸ Traffic Delay Alert - ${data.route_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #fef2f2; }
            .alert-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc2626; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>âš ï¸ Traffic Delay Alert</h1>
            </div>
            <div class="content">
              <h2>Your cab may be delayed</h2>
              <div class="alert-box">
                <p><strong>Route:</strong> ${data.route_name}</p>
                <p><strong>Expected Delay:</strong> ${data.delay_minutes} minutes</p>
                <p><strong>Traffic Level:</strong> ${data.traffic_level}</p>
              </div>
              <p>We apologize for the inconvenience. Your driver will update you on the exact arrival time.</p>
            </div>
            <div class="footer">
              <p>AISIN Automotive Karnataka Pvt. Ltd. - Cab Request Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  getDriverAssignmentTemplate(data) {
    return {
      subject: `New Trip Assignment - Route ${data.route_name}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0f172a; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f8fafc; }
            .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .passenger-list { background: #f0f9ff; padding: 15px; border-radius: 8px; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>ðŸš— New Trip Assignment</h1>
            </div>
            <div class="content">
              <h2>You have a new trip assignment</h2>
              <div class="info-box">
                <p><strong>Route:</strong> ${data.route_name}</p>
                <p><strong>Start Time:</strong> ${data.pickup_time}</p>
                <p><strong>From:</strong> ${data.start_point}</p>
                <p><strong>To:</strong> ${data.end_point}</p>
                <p><strong>Passengers:</strong> ${data.passenger_count}</p>
              </div>
              <div class="passenger-list">
                <h3>Passenger Details</h3>
                ${data.passengers.map(p => `<p>â€¢ ${p.name} - ${p.phone || 'No phone'}</p>`).join('')}
              </div>
              <p>Please ensure your location is enabled and start on time.</p>
            </div>
            <div class="footer">
              <p>AISIN Automotive Karnataka Pvt. Ltd. - Cab Request Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }

  // Process pending email notifications
  async processPendingEmails() {
    try {
      const pendingNotifications = await Notification.getPendingEmailNotifications(50);
      
      for (const notification of pendingNotifications) {
        let template;
        
        switch (notification.type) {
          case 'REQUEST_CONFIRMED':
            template = this.getRequestConfirmationTemplate(JSON.parse(notification.data || '{}'));
            break;
          case 'CAB_ASSIGNED':
            template = this.getCabAssignmentTemplate(JSON.parse(notification.data || '{}'));
            break;
          case 'DELAY':
          case 'TRAFFIC_ALERT':
            template = this.getDelayNotificationTemplate(JSON.parse(notification.data || '{}'));
            break;
          default:
            template = {
              subject: notification.title,
              html: `<p>${notification.message}</p>`
            };
        }

        const result = await this.sendEmail(notification.email, template.subject, template.html);
        
        if (result.success) {
          await Notification.markEmailSent(notification.id);
        }
      }

      return { processed: pendingNotifications.length };
    } catch (error) {
      logger.error('Error processing pending emails:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();

