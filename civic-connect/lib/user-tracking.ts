import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  sanitizeInterestSelections,
  normalizeTopicWeights,
} from "./account-interests";

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
}: {
  email: string;
  interestSelections: string[];
}) {
  const normalizedEmail = normalizeEmail(email);
  const selections = sanitizeInterestSelections(interestSelections);

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

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: normalizedEmail,
      interestSelections: selections,
      lastSeen: new Date(),
    },
  });

  cookies().set(USER_COOKIE_NAME, userId, getPersistentCookieOptions());

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

export async function endSession(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { endTime: new Date() },
  });
}
