exports.handler = async function handler() {
  const baseUrl = process.env.APP_BASE_URL || "https://www.civicconnect.net";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    throw new Error("CRON_SECRET is required");
  }

  const response = await fetch(`${baseUrl}/api/account/digests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Digest dispatch failed: ${response.status} ${body}`);
  }

  return {
    statusCode: response.status,
    body,
  };
};
