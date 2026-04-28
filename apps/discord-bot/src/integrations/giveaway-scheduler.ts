/* eslint-disable max-statements, no-void */

import type { Client } from "discord.js";
import { log } from "evlog";

import { getActiveGiveaways } from "./giveaway-persistence";

export interface GiveawayScheduler {
  cancelGiveawayEnd: (giveawayId: string) => void;
  loadPendingGiveaways: (client: Client<true>) => Promise<void>;
  scheduleGiveawayEnd: ({
    client,
    endsAt,
    giveawayId,
  }: {
    client: Client<true>;
    endsAt: Date;
    giveawayId: string;
  }) => void;
  stop: () => void;
}

export const createGiveawayScheduler = ({
  onConclude,
}: {
  onConclude: (payload: {
    client: Client<true>;
    giveawayId: string;
  }) => Promise<void>;
}): GiveawayScheduler => {
  const timers = new Map<string, NodeJS.Timeout>();
  let isStopped = false;

  const cancelGiveawayEnd = (giveawayId: string): void => {
    const timer = timers.get(giveawayId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(giveawayId);
    }
  };

  const scheduleGiveawayEnd = ({
    client,
    endsAt,
    giveawayId,
  }: {
    client: Client<true>;
    endsAt: Date;
    giveawayId: string;
  }): void => {
    if (isStopped) {
      return;
    }

    cancelGiveawayEnd(giveawayId);

    const delayMs = endsAt.getTime() - Date.now();

    if (delayMs <= 0) {
      log.info({
        giveawayId,
        message: "Giveaway end time already passed, concluding immediately",
      });

      void onConclude({ client, giveawayId });
      return;
    }

    const timer = setTimeout(() => {
      timers.delete(giveawayId);
      void onConclude({ client, giveawayId });
    }, delayMs);

    timer.unref?.();
    timers.set(giveawayId, timer);

    log.debug({
      delayMs,
      giveawayId,
      message: "Scheduled giveaway conclusion",
    });
  };

  const loadPendingGiveaways = async (client: Client<true>): Promise<void> => {
    if (isStopped) {
      return;
    }

    const giveaways = await getActiveGiveaways();

    log.info({
      count: giveaways.length,
      message: "Loading pending giveaways for scheduling",
    });

    for (const giveaway of giveaways) {
      scheduleGiveawayEnd({
        client,
        endsAt: giveaway.endsAt,
        giveawayId: giveaway.id,
      });
    }
  };

  const stop = (): void => {
    if (isStopped) {
      return;
    }

    isStopped = true;

    for (const [giveawayId, timer] of timers) {
      clearTimeout(timer);
      timers.delete(giveawayId);
    }

    log.info({
      message: "Stopped giveaway scheduler",
    });
  };

  return {
    cancelGiveawayEnd,
    loadPendingGiveaways,
    scheduleGiveawayEnd,
    stop,
  };
};
