import { prisma } from "./prisma";
import { getPersonalizedBills } from "./recommendations";
import { ensureAccountSchema } from "./account-schema";
import {
  getLocalTimeParts,
  isValidTimeZone,
  sanitizeEmailSubscriptions,
  type EmailSubscription,
} from "./email-preferences";
import { getAppBaseUrl, sendTransactionalEmail } from "./email";
import { getRelatedOrganizationsAndEvents } from "./organization-matching";
import { getBillChamberFocus } from "./legislative";
import {
  getStanceDisplayLabel,
  listBillRepresentativePositions,
} from "./rep-positions";
import { formatTopicTag } from "./topics";

type DigestKind = "daily" | "weekly" | "onboarding";

export async function dispatchDueDigestEmails(now = new Date()) {
  await ensureAccountSchema();

  const users = await prisma.user.findMany({
    where: {
      email: {
        not: null,
      },
      timezone: {
        not: null,
      },
    },
    select: {
      id: true,
      email: true,
      timezone: true,
      emailSubscriptions: true,
      preferredRepBioguideIds: true,
      createdAt: true,
      onboardingDigestSentAt: true,
    },
  });

  const stats = {
    processedUsers: 0,
    sent: 0,
    skipped: 0,
  };

  for (const user of users) {
    const timezone =
      user.timezone && isValidTimeZone(user.timezone)
        ? user.timezone
        : "America/New_York";
    const local = getLocalTimeParts(now, timezone);

    if (local.hour !== 9) {
      stats.skipped += 1;
      continue;
    }

    const subscriptions = sanitizeEmailSubscriptions(
      user.emailSubscriptions as string[]
    );
    const digestKind = await getDueDigestKind({
      userId: user.id,
      subscriptions,
      timezone,
      createdAt: user.createdAt,
      onboardingDigestSentAt: user.onboardingDigestSentAt,
      now,
    });

    if (!digestKind || !user.email) {
      stats.skipped += 1;
      continue;
    }

    stats.processedUsers += 1;

    const sent = await sendDigestToUser({
      userId: user.id,
      email: user.email,
      timezone,
      preferredRepBioguideIds: user.preferredRepBioguideIds,
      digestKind,
      localDateKey: local.localDateKey,
    });

    if (sent) {
      stats.sent += 1;

      await prisma.emailDigestLog.create({
        data: {
          userId: user.id,
          kind: digestKind,
          localDateKey: local.localDateKey,
        },
      });

      if (digestKind === "onboarding") {
        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            onboardingDigestSentAt: now,
          },
        });
      }
    } else {
      stats.skipped += 1;
    }
  }

  return stats;
}

async function getDueDigestKind({
  userId,
  subscriptions,
  timezone,
  createdAt,
  onboardingDigestSentAt,
  now,
}: {
  userId: string;
  subscriptions: EmailSubscription[];
  timezone: string;
  createdAt: Date;
  onboardingDigestSentAt: Date | null;
  now: Date;
}): Promise<DigestKind | null> {
  const localNow = getLocalTimeParts(now, timezone);
  const localCreated = getLocalTimeParts(createdAt, timezone);

  if (
    !onboardingDigestSentAt &&
    localNow.localDateKey > localCreated.localDateKey
  ) {
    return "onboarding";
  }

  if (subscriptions.includes("daily")) {
    const existingDaily = await prisma.emailDigestLog.findUnique({
      where: {
        userId_kind_localDateKey: {
          userId,
          kind: "daily",
          localDateKey: localNow.localDateKey,
        },
      },
    });

    if (!existingDaily) {
      return "daily";
    }
  }

  if (subscriptions.includes("weekly") && localNow.weekday === "Mon") {
    const existingWeekly = await prisma.emailDigestLog.findUnique({
      where: {
        userId_kind_localDateKey: {
          userId,
          kind: "weekly",
          localDateKey: localNow.localDateKey,
        },
      },
    });

    if (!existingWeekly) {
      return "weekly";
    }
  }

  return null;
}

async function sendDigestToUser({
  userId,
  email,
  timezone,
  preferredRepBioguideIds,
  digestKind,
  localDateKey,
}: {
  userId: string;
  email: string;
  timezone: string;
  preferredRepBioguideIds: string[];
  digestKind: DigestKind;
  localDateKey: string;
}) {
  const baseUrl = getAppBaseUrl();
  const limit = 12;
  const billIds = await getPersonalizedBills(userId, limit);

  if (billIds.length === 0) {
    return false;
  }

  const bills = await prisma.bill.findMany({
    where: {
      id: {
        in: billIds,
      },
    },
    include: {
      summary: true,
    },
  });

  const orderedBills = billIds
    .map((billId) => bills.find((bill) => bill.id === billId))
    .filter((bill): bill is NonNullable<typeof bill> => Boolean(bill))
    .slice(0, limit);

  if (orderedBills.length === 0) {
    return false;
  }

  const items = await Promise.all(
    orderedBills.map(async (bill) => {
      const { orgs } = await getRelatedOrganizationsAndEvents(bill.topicTags, {
        orgLimit: 1,
        eventLimit: 0,
      });
      const chamber = getBillChamberFocus(bill.status, bill.type);
      const positions = await listBillRepresentativePositions({
        billId: bill.id,
        chamber,
        preferredRepBioguideIds,
      });
      const contactRep =
        positions.find((position) => position.isPreferred && position.websiteUrl) ||
        positions.find(
          (position) => position.stance !== "neutral" && position.websiteUrl
        ) ||
        positions.find((position) => position.websiteUrl) ||
        null;

      return {
        bill,
        organization: orgs[0] ?? null,
        contactRep,
        contactRepUrl: `${baseUrl}/bill/${bill.id}/contact`,
      };
    })
  );

  const subject =
    digestKind === "weekly"
      ? "Bills to watch this week"
      : "Bills you should read today";

  const heading =
    digestKind === "weekly"
      ? "Bills to watch this week and how you can impact them"
      : "Bills you should read today and how you can impact them";

  const htmlCards = items
    .map(({ bill, organization, contactRep, contactRepUrl }) => {
      const billUrl = `${baseUrl}/bill/${bill.id}`;
      const summary =
        bill.summary?.plainLanguage ||
        bill.summary?.whyItMatters ||
        "Open the bill for the latest plain-language breakdown.";
      const repLine = contactRep
        ? `${contactRep.name} · ${getStanceDisplayLabel(contactRep.stance)}`
        : "Representative contact guide available on the bill page";

      return `
        <div style="border-top:1px solid rgba(16,36,62,0.1);padding:24px 0;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(16,36,62,0.45);font-weight:700;">${bill.id.toUpperCase()} · ${bill.topicTags[0] ? formatTopicTag(bill.topicTags[0]) : "General"}</div>
          <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;line-height:1.02;margin:10px 0 12px;">
            <a href="${billUrl}" style="color:#10243e;text-decoration:none;">${bill.title}</a>
          </h2>
          <p style="font-size:15px;line-height:1.8;margin:0 0 14px;color:rgba(16,36,62,0.82);">${summary}</p>
          ${
            bill.summary?.whyItMatters
              ? `<p style="font-size:14px;line-height:1.75;margin:0 0 14px;color:rgba(16,36,62,0.72);"><strong>Why it matters:</strong> ${bill.summary.whyItMatters}</p>`
              : ""
          }
          ${
            organization
              ? `<p style="font-size:13px;line-height:1.7;margin:0 0 8px;color:rgba(16,36,62,0.68);"><strong>Organization:</strong> ${
                  organization.website
                    ? `<a href="${organization.website}" style="color:#183f7a;text-decoration:none;">${organization.name}</a>`
                    : organization.name
                }</p>`
              : ""
          }
          <p style="font-size:13px;line-height:1.7;margin:0 0 8px;color:rgba(16,36,62,0.68);"><strong>Representative:</strong> ${repLine}</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${billUrl}" style="display:inline-block;background:#10243e;color:#ffffff;text-decoration:none;padding:12px 16px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">Read the bill</a>
            <a href="${contactRepUrl}" style="display:inline-block;border:1px solid rgba(16,36,62,0.2);color:#10243e;text-decoration:none;padding:12px 16px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">Contact your representatives</a>
          </div>
        </div>
      `;
    })
    .join("");

  const html = `
    <div style="background:#f6f1e7;padding:32px;font-family:'Libre Franklin',Arial,sans-serif;color:#10243e;">
      <div style="max-width:720px;margin:0 auto;background:#fffdf9;border:1px solid rgba(16,36,62,0.08);padding:40px;">
        <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(16,36,62,0.55);font-weight:700;">Latest legislation, decoded.</div>
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:46px;line-height:1;margin:18px 0 8px;">${heading}</h1>
        <p style="font-size:15px;line-height:1.8;margin:0 0 24px;color:rgba(16,36,62,0.72);">Prepared for you on ${localDateKey} · ${timezone}</p>
        ${htmlCards}
      </div>
    </div>
  `;

  const text = `${heading}

${items
  .map(({ bill, organization, contactRep }) => {
    return `${bill.title}
${baseUrl}/bill/${bill.id}

${bill.summary?.plainLanguage || "Open the bill for the latest plain-language breakdown."}
${bill.summary?.whyItMatters ? `Why it matters: ${bill.summary.whyItMatters}` : ""}
${organization ? `Organization: ${organization.name}${organization.website ? ` — ${organization.website}` : ""}` : ""}
${contactRep ? `Representative: ${contactRep.name} — ${getStanceDisplayLabel(contactRep.stance)}${contactRep.websiteUrl ? ` — ${contactRep.websiteUrl}` : ""}` : ""}
`;
  })
  .join("\n")}`;

  return sendTransactionalEmail({
    to: email,
    subject,
    html,
    text,
  });
}
