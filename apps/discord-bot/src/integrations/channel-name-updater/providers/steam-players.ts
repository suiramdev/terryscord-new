/* eslint-disable max-statements */

import { log } from "evlog";

const STEAM_API_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=590830";

interface SteamApiResponse {
  response: {
    player_count: number;
    result: number;
  };
}

export const fetchSteamPlayerCount = async (): Promise<number | null> => {
  try {
    const response = await fetch(STEAM_API_URL, {
      method: "GET",
    });

    if (!response.ok) {
      log.warn({
        message: "Steam API returned non-OK status",
        status: response.status,
        statusText: response.statusText,
      });

      return null;
    }

    const data = (await response.json()) as SteamApiResponse;
    const playerCount = data.response?.player_count;

    if (typeof playerCount !== "number") {
      log.warn({
        message: "Steam API response missing player_count",
        response: data,
      });

      return null;
    }

    return playerCount;
  } catch (error: unknown) {
    log.error({
      err: error,
      message: "Failed to fetch Steam player count",
    });

    return null;
  }
};
