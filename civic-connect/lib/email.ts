import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let sesClient: SESv2Client | null = null;

function getEmailRegion() {
  return process.env.AWS_REGION || "us-east-1";
}

export function getAppBaseUrl() {
  return (process.env.APP_BASE_URL || "https://www.civicconnect.net").replace(
    /\/$/,
    ""
  );
}

export function getFromEmail() {
  return process.env.SES_FROM_EMAIL || null;
}

export function isEmailConfigured() {
  return Boolean(getFromEmail());
}

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: getEmailRegion(),
    });
  }

  return sesClient;
}

export async function sendTransactionalEmail({
  to,
  subject,
  html,
  text,
}: EmailPayload) {
  const from = getFromEmail();

  if (!from) {
    console.warn("Email skipped: SES_FROM_EMAIL is not configured.");
    return false;
  }

  try {
    await getSesClient().send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: {
          ToAddresses: [to],
        },
        ReplyToAddresses: process.env.SES_REPLY_TO
          ? [process.env.SES_REPLY_TO]
          : undefined,
        Content: {
          Simple: {
            Subject: {
              Data: subject,
              Charset: "UTF-8",
            },
            Body: {
              Html: {
                Data: html,
                Charset: "UTF-8",
              },
              Text: {
                Data: text,
                Charset: "UTF-8",
              },
            },
          },
        },
      })
    );

    return true;
  } catch (error) {
    console.error("Email send failed:", error);
    return false;
  }
}

export async function sendWelcomeEmail({
  email,
  selectedTopics,
}: {
  email: string;
  selectedTopics: string[];
}) {
  const baseUrl = getAppBaseUrl();
  const subject = "Your CivicConnect desk is ready";
  const topicsLine =
    selectedTopics.length > 0
      ? `You’re now following ${selectedTopics.slice(0, 4).join(", ")}${
          selectedTopics.length > 4 ? ", and more" : ""
        }.`
      : "You can tune your issue picks any time from your account.";

  const html = `
    <div style="background:#f6f1e7;padding:32px;font-family:'Libre Franklin',Arial,sans-serif;color:#10243e;">
      <div style="max-width:620px;margin:0 auto;background:#fffdf9;border:1px solid rgba(16,36,62,0.08);padding:40px;">
        <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(16,36,62,0.55);font-weight:700;">Latest legislation, decoded.</div>
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:46px;line-height:1;margin:18px 0 12px;">Welcome to CivicConnect</h1>
        <p style="font-size:16px;line-height:1.8;margin:0 0 18px;">Hi there. Your account is live and your desk is saved.</p>
        <p style="font-size:15px;line-height:1.8;margin:0 0 18px;">${topicsLine}</p>
        <p style="font-size:15px;line-height:1.8;margin:0 0 28px;">Tomorrow morning, and then on your selected schedule, we’ll send a sharp list of bills worth your attention, along with the organizations and representatives tied to them.</p>
        <a href="${baseUrl}/bills?personalized=true" style="display:inline-block;background:#10243e;color:#ffffff;text-decoration:none;padding:14px 18px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;font-weight:700;">Open Your Desk</a>
      </div>
    </div>
  `;

  const text = `Welcome to CivicConnect.

Your account is live and your desk is saved.

${topicsLine}

Open your desk: ${baseUrl}/bills?personalized=true`;

  return sendTransactionalEmail({
    to: email,
    subject,
    html,
    text,
  });
}
