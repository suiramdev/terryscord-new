import { log } from "evlog";

export interface PersistedCaptchaSessionState {
  alertThresholdReached: boolean;
  attemptsUsed: number;
  challengeMessageId: string;
  expectedResponse: string;
  verificationChannelId: string;
}

interface PersistedCaptchaSessionStateRecord {
  alertThresholdReached: boolean;
  attemptsUsed: number;
  challengeMessageId: string;
  expectedResponse: string;
  verificationChannelId: string;
}

interface GuildVerificationSessionDelegate {
  deleteMany: (args: unknown) => Promise<unknown>;
  findUnique: (
    args: unknown
  ) => Promise<PersistedCaptchaSessionStateRecord | null>;
  upsert: (args: unknown) => Promise<PersistedCaptchaSessionStateRecord>;
}

interface CaptchaSessionStatePrismaClient {
  guildVerificationSession: GuildVerificationSessionDelegate;
}

let prismaClientPromise: Promise<CaptchaSessionStatePrismaClient> | null = null;

const toSafeAttemptsUsed = (value: number): number =>
  Number.isInteger(value) && value >= 0 ? value : 0;

const loadPrismaClient = (): Promise<CaptchaSessionStatePrismaClient> => {
  if (prismaClientPromise) {
    return prismaClientPromise;
  }

  prismaClientPromise = (async (): Promise<CaptchaSessionStatePrismaClient> => {
    try {
      const databaseModule = await import("@terryscord/db");
      return databaseModule.default as unknown as CaptchaSessionStatePrismaClient;
    } catch (error: unknown) {
      prismaClientPromise = null;
      throw error;
    }
  })();

  return prismaClientPromise;
};
export const getPersistedCaptchaSessionState = async ({
  guildId,
  userId,
}: {
  guildId: string;
  userId: string;
}): Promise<PersistedCaptchaSessionState | null> => {
  try {
    const prisma = await loadPrismaClient();
    const row = await prisma.guildVerificationSession.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
    });
    if (!row) {
      return null;
    }

    return {
      alertThresholdReached: Boolean(row.alertThresholdReached),
      attemptsUsed: toSafeAttemptsUsed(row.attemptsUsed),
      challengeMessageId: row.challengeMessageId,
      expectedResponse: row.expectedResponse,
      verificationChannelId: row.verificationChannelId,
    };
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to load persisted captcha session state",
      userId,
    });
    return null;
  }
};

export const upsertPersistedCaptchaSessionState = async ({
  guildId,
  state,
  userId,
}: {
  guildId: string;
  state: PersistedCaptchaSessionState;
  userId: string;
}): Promise<void> => {
  try {
    const prisma = await loadPrismaClient();
    await prisma.guildVerificationSession.upsert({
      create: {
        alertThresholdReached: state.alertThresholdReached,
        attemptsUsed: toSafeAttemptsUsed(state.attemptsUsed),
        challengeMessageId: state.challengeMessageId,
        expectedResponse: state.expectedResponse,
        guildId,
        userId,
        verificationChannelId: state.verificationChannelId,
      },
      update: {
        alertThresholdReached: state.alertThresholdReached,
        attemptsUsed: toSafeAttemptsUsed(state.attemptsUsed),
        challengeMessageId: state.challengeMessageId,
        expectedResponse: state.expectedResponse,
        verificationChannelId: state.verificationChannelId,
      },
      where: {
        guildId_userId: {
          guildId,
          userId,
        },
      },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to persist captcha session state",
      userId,
    });
  }
};

export const deletePersistedCaptchaSessionState = async ({
  guildId,
  userId,
}: {
  guildId: string;
  userId: string;
}): Promise<void> => {
  try {
    const prisma = await loadPrismaClient();
    await prisma.guildVerificationSession.deleteMany({
      where: {
        guildId,
        userId,
      },
    });
  } catch (error: unknown) {
    log.error({
      err: error,
      guildId,
      message: "Failed to delete persisted captcha session state",
      userId,
    });
  }
};
