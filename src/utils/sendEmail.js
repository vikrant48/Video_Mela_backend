import nodemailer from "nodemailer";
import { logger } from "./logger.js";

// Logs identify the recipient without writing full addresses
const maskEmail = (email) => String(email).replace(/^(.)[^@]*/, "$1***");

// Returns the send info, or null on failure (never throws), so callers decide how to react
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
            logger.info(`Email sent to ${maskEmail(email)}: ${info.messageId}`);
            return info;
        }

        // Without SMTP in production, fail loudly but never write the message (it holds codes) to logs
        if (process.env.NODE_ENV === "production") {
            logger.error(`SMTP is not configured: email "${subject}" to ${maskEmail(email)} was NOT sent`);
            return null;
        }

        // Development/testing fallback: print the email (including any code) to the console
        console.log(`\n============== [DEV EMAIL - not sent] ==============`);
        console.log(`To: ${email}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content:\n${text || html}`);
        console.log(`====================================================\n`);
        return { messageId: "dev-fallback-message-id" };
    } catch (error) {
        logger.error(`Error sending email to ${maskEmail(email)}: ${error.message}`);
        return null;
    }
};
