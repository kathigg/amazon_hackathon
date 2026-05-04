import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  sanitizeInterestSelections,
  getInterestTopicWeights,
  normalizeTopicWeights,
} from "./account-interests";
import {
  isValidTimeZone,
  sanitizeEmailSubscriptions,
  type EmailSubscription,
} from "./email-preferences";
import { sendWelcomeEmail } from "./email";

const USER_COOKIE_NAME = "civic_user_id";
const SESSION_COOKIE_NAME = "civic_session_id";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

class AccountConflictError extends Error {}

function getPersistentCookieOptions() {
  return {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function clearCookie(name: string) {
  const cookieStore = cookies();
  cookieStore.set(name, "", {
    ...getPersistentCookieOptions(),
    maxAge: 0,
  });
}

async function findUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      interestSelections: true,
      topicWeights: true,
      emailSubscriptions: true,
      timezone: true,
      zipCode: true,
      preferredRepBioguideIds: true,
      welcomeEmailSentAt: true,
      onboardingDigestSentAt: true,
      createdAt: true,
      lastSeen: true,
    },
  });
}

export async function getCurrentUserId(): Promise<string | undefined> {
  const userId = cookies().get(USER_COOKIE_NAME)?.value;

  if (!userId) {
    return undefined;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  return user?.id;
}

export async function getCurrentUser() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return null;
  }

  return findUserById(userId);
}

export async function getOrCreateUserId(): Promise<string> {
  const cookieStore = cookies();
  const cookieUserId = cookieStore.get(USER_COOKIE_NAME)?.value;

  if (cookieUserId) {
    const existingUser = await prisma.user.findUnique({
      where: { id: cookieUserId },
      select: { id: true },
    });

    if (existingUser) {
      await prisma.user.update({
        where: { id: cookieUserId },
        data: { lastSeen: new Date() },
      });

      return existingUser.id;
    }
  }

  const user = await prisma.user.create({
    data: {
      cookieId: crypto.randomUUID(),
    },
  });

  cookieStore.set(USER_COOKIE_NAME, user.id, getPersistentCookieOptions());

  return user.id;
}

export async function saveAccountProfile({
  email,
  interestSelections,
  emailSubscriptions,
  timezone,
  zipCode,
  preferredRepBioguideIds,
}: {
  email: string;
  interestSelections: string[];
  emailSubscriptions: string[];
  timezone?: string;
  zipCode?: string;
  preferredRepBioguideIds?: string[];
}) {
  const normalizedEmail = normalizeEmail(email);
  const selections = sanitizeInterestSelections(interestSelections);
  const subscriptions = sanitizeEmailSubscriptions(emailSubscriptions);
  const sanitizedTimezone = isValidTimeZone(timezone) ? timezone : undefined;
  const sanitizedZipCode = zipCode?.trim() || undefined;
  const sanitizedPreferredRepIds = Array.from(
    new Set((preferredRepBioguideIds ?? []).map((value) => value.trim()).filter(Boolean))
  ).slice(0, 6);

  if (selections.length === 0) {
    throw new Error("Select at least one issue before continuing.");
  }

  const userId = await getOrCreateUserId();
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser && existingUser.id !== userId) {
    throw new AccountConflictError(
      "That email already has an account. Use log in instead."
    );
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      welcomeEmailSentAt: true,
    },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalizedEmail,
      interestSelections: selections,
      emailSubscriptions: subscriptions,
      timezone: sanitizedTimezone,
      zipCode: sanitizedZipCode,
      preferredRepBioguideIds: sanitizedPreferredRepIds,
      topicWeights: getInterestTopicWeights(selections),
      lastSeen: new Date(),
    },
  });

  cookies().set(USER_COOKIE_NAME, userId, getPersistentCookieOptions());

  const shouldSendWelcomeEmail =
    !currentUser?.welcomeEmailSentAt &&
    (!currentUser?.email || currentUser.email !== normalizedEmail);

  if (shouldSendWelcomeEmail) {
    const sent = await sendWelcomeEmail({
      email: normalizedEmail,
      selectedTopics: selections,
    });

    if (sent) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          welcomeEmailSentAt: new Date(),
        },
      });
    }
  }

  await clearSessionCookiesForUser(userId);

  return findUserById(userId);
}

export async function loginWithEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!user) {
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeen: new Date() },
  });

  const cookieStore = cookies();
  cookieStore.set(USER_COOKIE_NAME, user.id, getPersistentCookieOptions());
  clearCookie(SESSION_COOKIE_NAME);

  return findUserById(user.id);
}

export async function saveUserPreferences({
  zipCode,
  preferredRepBioguideIds,
}: {
  zipCode?: string;
  preferredRepBioguideIds?: string[];
}) {
  const userId = await getOrCreateUserId();
  const sanitizedZipCode = zipCode?.trim() || undefined;
  const sanitizedPreferredRepIds = Array.from(
    new Set((preferredRepBioguideIds ?? []).map((value) => value.trim()).filter(Boolean))
  ).slice(0, 6);

  await prisma.user.update({
    where: { id: userId },
    data: {
      zipCode: sanitizedZipCode,
      preferredRepBioguideIds: sanitizedPreferredRepIds,
      lastSeen: new Date(),
    },
  });

  cookies().set(USER_COOKIE_NAME, userId, getPersistentCookieOptions());

  return findUserById(userId);
}

export function logoutCurrentUser() {
  clearCookie(USER_COOKIE_NAME);
  clearCookie(SESSION_COOKIE_NAME);
}

export { AccountConflictError };

export async function getUserId(): Promise<string | undefined> {
  return getCurrentUserId();
}

export async function getOrCreateSession(userId: string): Promise<string> {
  const cookieStore = cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    const session = await prisma.session.create({
      data: { userId },
    });
    sessionId = session.id;
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, getSessionCookieOptions());
    return sessionId;
  }

  const existingSession = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true },
  });

  if (existingSession?.userId === userId) {
    return existingSession.id;
  }

  const session = await prisma.session.create({
    data: { userId },
  });

  cookieStore.set(SESSION_COOKIE_NAME, session.id, getSessionCookieOptions());

  return session.id;
}

export async function trackPageView(path: string, userId: string) {
  await prisma.pageView.create({
    data: {
      path,
      userId,
    },
  });
}

export async function trackBillView(
  userId: string,
  billId: string,
  timeSpent: number,
  scrollDepth: number
) {
  const sessionId = await getOrCreateSession(userId).catch(() => undefined);

  await prisma.billView.create({
    data: {
      userId,
      billId,
      timeSpent,
      scrollDepth,
    },
  });

  if (sessionId) {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        billsRead: { increment: 1 },
        pageCount: { increment: 1 },
      },
    });
  }
}

export async function updateTopicWeights(userId: string, topics: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) return;

  const weights = normalizeTopicWeights(user.topicWeights);

  for (const topic of topics) {
    weights[topic] = (weights[topic] || 0) + 1;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { topicWeights: weights },
  });
}

async function clearSessionCookiesForUser(userId: string) {
  const activeSessions = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
  });

  if (activeSessions.length === 0) {
    return;
  }

  const cookieStore = cookies();
  const currentSessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (currentSessionId && activeSessions.some((session) => session.id === currentSessionId)) {
    clearCookie(SESSION_COOKIE_NAME);
  }
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;
export type CurrentUserRecord = NonNullable<CurrentUser>;
export type CurrentEmailSubscription = EmailSubscription;

export async function endSession(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { endTime: new Date() },
  });
}
