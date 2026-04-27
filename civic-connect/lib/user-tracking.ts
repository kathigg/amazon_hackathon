import { cookies } from "next/headers";
import { prisma } from "./prisma";

const USER_COOKIE_NAME = "civic_user_id";
const SESSION_COOKIE_NAME = "civic_session_id";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export async function getUserId(): Promise<string> {
  const cookieStore = cookies();
  let userId = cookieStore.get(USER_COOKIE_NAME)?.value;

  if (!userId) {
    // Create new user
    const user = await prisma.user.create({
      data: {
        cookieId: crypto.randomUUID(),
      },
    });
    userId = user.id;
    
    // Set cookie
    cookieStore.set(USER_COOKIE_NAME, userId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  // Update last seen
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeen: new Date() },
  }).catch(() => {
    // User might not exist if cookie is stale, ignore error
  });

  return userId;
}

export async function getOrCreateSession(userId: string): Promise<string> {
  const cookieStore = cookies();
  let sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    // Create new session
    const session = await prisma.session.create({
      data: {
        userId,
      },
    });
    sessionId = session.id;

    // Set session cookie (expires when browser closes)
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return sessionId;
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
  await prisma.billView.create({
    data: {
      userId,
      billId,
      timeSpent,
      scrollDepth,
    },
  });

  // Update session bill count
  const sessionId = cookies().get(SESSION_COOKIE_NAME)?.value;
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

  const weights = (user.topicWeights as Record<string, number>) || {};

  // Increment weight for each topic
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
