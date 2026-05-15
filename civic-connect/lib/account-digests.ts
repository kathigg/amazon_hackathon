import { prisma } from "./prisma";
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
  type PositionStance,
} from "./rep-positions";
import { formatTopicTag } from "./topics";
import {
  getProgressStageRank,
  type ProgressStage,
} from "./bill-progress";

type DigestKind = "daily" | "weekly" | "onboarding";

interface DigestDispatchOptions {
  dryRun?: boolean;
  targetEmail?: string;
  forceDigestKind?: DigestKind;
}

interface DigestPreview {
  email: string;
  digestKind: DigestKind;
  subject: string;
  billCount: number;
  html: string;
  text: string;
}

interface DigestDeliveryResult {
  sent: boolean;
  subject?: string;
  billCount: number;
  html?: string;
  text?: string;
  skippedReason?: string;
}

type DigestCandidate = {
  id: string;
  introducedAt: Date;
  latestActionAt: Date | null;
  stageReachedAt: Date | null;
  progressStage: string | null;
  viewCount: number;
};

const DIGEST_LIMIT = 12;
const DIGEST_STAGE_PRIORITY: ProgressStage[] = [
  "enacted",
  "to_president",
  "passed_both",
  "passed_origin",
  "committee",
  "introduced",
];

export async function dispatchDueDigestEmails(
  now = new Date(),
  options: DigestDispatchOptions = {}
) {
  await ensureAccountSchema();
  const targetEmail = options.targetEmail?.trim().toLowerCase();

  const users = await prisma.user.findMany({
    where: {
      email: targetEmail || { not: null },
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
    dryRun: Boolean(options.dryRun),
    previews: [] as DigestPreview[],
  };

  for (const user of users) {
    const timezone =
      user.timezone && isValidTimeZone(user.timezone)
        ? user.timezone
        : "America/New_York";
    const local = getLocalTimeParts(now, timezone);

    if (!options.forceDigestKind && local.hour !== 9) {
      stats.skipped += 1;
      continue;
    }

    const subscriptions = sanitizeEmailSubscriptions(
      user.emailSubscriptions as string[]
    );
    const digestKind =
      options.forceDigestKind ??
      (await getDueDigestKind({
        userId: user.id,
        subscriptions,
        timezone,
        createdAt: user.createdAt,
        onboardingDigestSentAt: user.onboardingDigestSentAt,
        now,
      }));

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
      dryRun: options.dryRun,
    });

    if (sent.sent) {
      stats.sent += 1;

      if (options.dryRun && sent.subject && sent.html && sent.text) {
        stats.previews.push({
          email: user.email,
          digestKind,
          subject: sent.subject,
          billCount: sent.billCount,
          html: sent.html,
          text: sent.text,
        });
      }

      if (!options.dryRun) {
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
      }
    } else {
      stats.skipped += 1;
    }
  }

  return stats;
}

export async function prepareTestDigestEmail({
  email,
  dryRun = true,
  now = new Date(),
}: {
  email: string;
  dryRun?: boolean;
  now?: Date;
}) {
  const timezone = "America/New_York";
  const local = getLocalTimeParts(now, timezone);

  return sendDigestToUser({
    userId: "test-preview",
    email,
    timezone,
    preferredRepBioguideIds: [],
    digestKind: "onboarding",
    localDateKey: local.localDateKey,
    dryRun,
  });
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
  if (subscriptions.length === 0) {
    return null;
  }

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
  dryRun,
}: {
  userId: string;
  email: string;
  timezone: string;
  preferredRepBioguideIds: string[];
  digestKind: DigestKind;
  localDateKey: string;
  dryRun?: boolean;
}): Promise<DigestDeliveryResult> {
  const baseUrl = getAppBaseUrl();
  const billIds = await selectDigestBillIds(DIGEST_LIMIT);

  if (billIds.length === 0) {
    return {
      sent: false,
      billCount: 0,
      skippedReason: "No digest candidate bills found.",
    };
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
    .slice(0, DIGEST_LIMIT);

  if (orderedBills.length === 0) {
    return {
      sent: false,
      billCount: 0,
      skippedReason: "Digest candidate bills could not be loaded.",
    };
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
      const selectedRepUpdates = positions
        .filter(
          (position) =>
            position.isPreferred &&
            position.stance !== "neutral" &&
            Boolean(position.reasoning)
        )
        .slice(0, 2);
      const contactRep =
        selectedRepUpdates.find((position) => position.websiteUrl) ||
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
        selectedRepUpdates,
        contactRepUrl: `${baseUrl}/bill/${bill.id}/contact`,
        selectRepsUrl: `${baseUrl}/account`,
      };
    })
  );

  const subject = getDigestSubject(digestKind);
  const heading = getDigestHeading(digestKind);

  const hasSelectedRepresentatives = preferredRepBioguideIds.length > 0;

  const htmlCards = items
    .map(
      ({
        bill,
        organization,
        contactRep,
        selectedRepUpdates,
        contactRepUrl,
        selectRepsUrl,
      }) => {
      const billUrl = `${baseUrl}/bill/${bill.id}`;
      const summary =
        bill.summary?.plainLanguage ||
        bill.summary?.whyItMatters ||
        "Open the bill for the latest plain-language breakdown.";
      const representativeHtml = getRepresentativeHtml({
        selectedRepUpdates,
        hasSelectedRepresentatives,
        selectRepsUrl,
      });

      return `
        <div style="border-top:1px solid rgba(16,36,62,0.1);padding:24px 0;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(16,36,62,0.45);font-weight:700;">${bill.id.toUpperCase()} · ${bill.topicTags[0] ? formatTopicTag(bill.topicTags[0]) : "General"}</div>
          <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:34px;line-height:1.02;margin:10px 0 12px;">
            <a href="${billUrl}" style="color:#10243e;text-decoration:none;">${escapeHtml(bill.title)}</a>
          </h2>
          <p style="font-size:15px;line-height:1.8;margin:0 0 14px;color:rgba(16,36,62,0.82);">${escapeHtml(summary)}</p>
          ${
            bill.summary?.whyItMatters
              ? `<p style="font-size:14px;line-height:1.75;margin:0 0 14px;color:rgba(16,36,62,0.72);"><strong>Why it matters:</strong> ${escapeHtml(bill.summary.whyItMatters)}</p>`
              : ""
          }
          ${
            organization
              ? `<p style="font-size:13px;line-height:1.7;margin:0 0 8px;color:rgba(16,36,62,0.68);"><strong>Organization:</strong> ${
                  organization.website
                    ? `<a href="${organization.website}" style="color:#183f7a;text-decoration:none;">${escapeHtml(organization.name)}</a>`
                    : escapeHtml(organization.name)
                }</p>`
              : ""
          }
          ${representativeHtml}
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <a href="${billUrl}" style="display:inline-block;background:#10243e;color:#ffffff;text-decoration:none;padding:12px 16px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">Read the bill</a>
            <a href="${contactRep ? contactRepUrl : selectRepsUrl}" style="display:inline-block;border:1px solid rgba(16,36,62,0.2);color:#10243e;text-decoration:none;padding:12px 16px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">${contactRep ? "Contact your representatives" : "Select representatives"}</a>
          </div>
        </div>
      `;
    }
    )
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
  .map(({ bill, organization, selectedRepUpdates, selectRepsUrl }) => {
    return `${bill.title}
${baseUrl}/bill/${bill.id}

${bill.summary?.plainLanguage || "Open the bill for the latest plain-language breakdown."}
${bill.summary?.whyItMatters ? `Why it matters: ${bill.summary.whyItMatters}` : ""}
${organization ? `Organization: ${organization.name}${organization.website ? ` — ${organization.website}` : ""}` : ""}
${getRepresentativeText({
  selectedRepUpdates,
  hasSelectedRepresentatives,
  selectRepsUrl,
})}
`;
  })
  .join("\n")}`;

  if (dryRun) {
    return {
      sent: true,
      subject,
      html,
      text,
      billCount: items.length,
    };
  }

  const sent = await sendTransactionalEmail({
    to: email,
    subject,
    html,
    text,
  });

  return {
    sent,
    subject,
    billCount: items.length,
  };
}

async function selectDigestBillIds(limit: number) {
  const stageQueries = DIGEST_STAGE_PRIORITY.map((stage) =>
    prisma.bill.findMany({
      where: {
        progressStage: stage,
      },
      take: 8,
      orderBy: [
        { stageReachedAt: { sort: "desc", nulls: "last" } },
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: digestCandidateSelect,
    })
  );

  const [recentBills, popularBills, ...stageResults] = await Promise.all([
    prisma.bill.findMany({
      take: 40,
      orderBy: [
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
        { viewCount: "desc" },
      ],
      select: digestCandidateSelect,
    }),
    prisma.bill.findMany({
      take: 32,
      orderBy: [
        { viewCount: "desc" },
        { latestActionAt: { sort: "desc", nulls: "last" } },
        { introducedAt: "desc" },
      ],
      select: digestCandidateSelect,
    }),
    ...stageQueries,
  ]);

  const candidates = Array.from(
    new Map(
      [...stageResults.flat(), ...recentBills, ...popularBills].map((bill) => [
        bill.id,
        bill,
      ])
    ).values()
  );

  return rankDigestCandidates(candidates).slice(0, limit).map((bill) => bill.id);
}

const digestCandidateSelect = {
  id: true,
  introducedAt: true,
  latestActionAt: true,
  stageReachedAt: true,
  progressStage: true,
  viewCount: true,
} satisfies Record<keyof DigestCandidate, true>;

function rankDigestCandidates(candidates: DigestCandidate[]) {
  if (candidates.length === 0) {
    return [];
  }

  const timestamps = candidates.map(getDigestTimestamp);
  const oldestTimestamp = Math.min(...timestamps);
  const newestTimestamp = Math.max(...timestamps);
  const maxViewLog = Math.max(
    ...candidates.map((bill) => Math.log1p(bill.viewCount))
  );

  return candidates
    .map((bill) => {
      const actionRange = newestTimestamp - oldestTimestamp;
      const recencyScore =
        actionRange === 0
          ? 1
          : (getDigestTimestamp(bill) - oldestTimestamp) / actionRange;
      const progressScore = getProgressStageRank(bill.progressStage) / 5;
      const viewScore =
        maxViewLog === 0 ? 0 : Math.log1p(bill.viewCount) / maxViewLog;

      return {
        bill,
        score: progressScore * 0.54 + recencyScore * 0.34 + viewScore * 0.12,
      };
    })
    .sort((left, right) => right.score - left.score)
    .map(({ bill }) => bill);
}

function getDigestTimestamp(bill: DigestCandidate) {
  const value = bill.stageReachedAt ?? bill.latestActionAt ?? bill.introducedAt;
  return value.getTime();
}

function getDigestSubject(digestKind: DigestKind) {
  switch (digestKind) {
    case "weekly":
      return "Bills to watch this week";
    case "daily":
      return "Bills you might be interested in today";
    default:
      return "Bills you might be interested in";
  }
}

function getDigestHeading(digestKind: DigestKind) {
  switch (digestKind) {
    case "weekly":
      return "Bills to watch this week";
    case "daily":
      return "Bills you might be interested in today";
    default:
      return "Bills you might be interested in";
  }
}

function getRepresentativeHtml({
  selectedRepUpdates,
  hasSelectedRepresentatives,
  selectRepsUrl,
}: {
  selectedRepUpdates: Array<{
    name: string;
    stance: PositionStance;
    reasoning: string | null;
    websiteUrl: string | null;
  }>;
  hasSelectedRepresentatives: boolean;
  selectRepsUrl: string;
}) {
  if (selectedRepUpdates.length > 0) {
    const updates = selectedRepUpdates
      .map((position) => {
        const sourceLink = position.websiteUrl
          ? ` <a href="${position.websiteUrl}" style="color:#183f7a;text-decoration:none;">Official source</a>`
          : "";
        return `<li style="margin:0 0 8px;"><strong>${escapeHtml(position.name)}:</strong> ${escapeHtml(getStanceDisplayLabel(position.stance))}. ${escapeHtml(position.reasoning ?? "A public position is available on the bill page.")}${sourceLink}</li>`;
      })
      .join("");

    return `
      <div style="margin:0 0 14px;padding:14px;background:#f6f1e7;border:1px solid rgba(16,36,62,0.08);">
        <p style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:rgba(16,36,62,0.5);margin:0 0 8px;">Selected representative updates</p>
        <ul style="font-size:13px;line-height:1.7;color:rgba(16,36,62,0.72);margin:0;padding-left:18px;">${updates}</ul>
      </div>
    `;
  }

  if (hasSelectedRepresentatives) {
    return `<p style="font-size:13px;line-height:1.7;margin:0 0 14px;color:rgba(16,36,62,0.68);"><strong>Representative update:</strong> No recent selected-representative statement is available for this bill yet.</p>`;
  }

  return `<p style="font-size:13px;line-height:1.7;margin:0 0 14px;color:rgba(16,36,62,0.68);"><strong>Representative update:</strong> <a href="${selectRepsUrl}" style="color:#183f7a;text-decoration:none;">Select your representatives</a> to see if your senators or House member have taken a public position.</p>`;
}

function getRepresentativeText({
  selectedRepUpdates,
  hasSelectedRepresentatives,
  selectRepsUrl,
}: {
  selectedRepUpdates: Array<{
    name: string;
    stance: PositionStance;
    reasoning: string | null;
    websiteUrl: string | null;
  }>;
  hasSelectedRepresentatives: boolean;
  selectRepsUrl: string;
}) {
  if (selectedRepUpdates.length > 0) {
    return selectedRepUpdates
      .map(
        (position) =>
          `Representative update: ${position.name} — ${getStanceDisplayLabel(
            position.stance
          )}. ${position.reasoning ?? ""}${
            position.websiteUrl ? ` ${position.websiteUrl}` : ""
          }`
      )
      .join("\n");
  }

  if (hasSelectedRepresentatives) {
    return "Representative update: No recent selected-representative statement is available for this bill yet.";
  }

  return `Representative update: Select your representatives to see if your senators or House member have taken a public position. ${selectRepsUrl}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
