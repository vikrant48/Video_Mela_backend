import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export const sendEmail = async ({ email, subject, text, html }) => {
    try {
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = process.env.SMTP_PORT || 587;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        // If SMTP configuration is provided, send real email via Nodemailer
        if (smtpHost && smtpUser && smtpPass) {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort),
                secure: Number(smtpPort) === 465, // true for 465, false for other ports
                auth: {
                    user: smtpUser,
                    pass: smtpPass,
                },
                family: 4, // Force IPv4 to prevent ENETUNREACH IPv6 connection errors
            });

            const mailOptions = {
                from: process.env.SMTP_FROM || `"VideoMela" <${smtpUser}>`,
                to: email,
                subject,
                text,
                html,
            };

            const info = await transporter.sendMail(mailOptions);
            logger.info(`Email sent to ${email}: ${info.messageId}`);
            return info;
        } else {
            // Fallback for development/testing when SMTP env vars are not set
            logger.info(`[MAILER DEV FALLBACK] To: ${email} | Subject: "${subject}"`);
            logger.info(`[MAILER DEV FALLBACK CONTENT]:\n${text || html}`);
            console.log(`\n============== [OTP EMAIL SENT] ==============`);
            console.log(`To: ${email}`);
            console.log(`Subject: ${subject}`);
            console.log(`Content:\n${text || html}`);
            console.log(`=============================================\n`);
            return { messageId: "dev-fallback-message-id" };
        }
    } catch (error) {
        logger.error(`Error sending email to ${email}: ${error.message}`);
        // Log error but don't crash - return false so controller can handle error gracefully
        return null;
    }
};
