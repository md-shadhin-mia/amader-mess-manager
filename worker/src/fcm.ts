/**
 * Firebase Cloud Messaging HTTP v1 sender.
 * https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Path or URL opened when the notification is clicked. */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag: string;
}

export type SendResult =
  | { ok: true }
  | { ok: false; unregistered: boolean; error: string };

export async function sendPush(
  accessToken: string,
  projectId: string,
  fcmToken: string,
  message: PushMessage,
): Promise<SendResult> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        // `notification` lets the browser display it even if the page's service worker is asleep.
        notification: { title: message.title, body: message.body },
        // `data` mirrors the same fields so the service worker and foreground handler get them too.
        data: { title: message.title, body: message.body, url: message.url, tag: message.tag },
        webpush: {
          headers: { Urgency: 'high', TTL: '86400' },
          notification: { icon: '/icon.svg', badge: '/icon.svg', tag: message.tag },
          fcm_options: { link: message.url },
        },
      },
    }),
  });

  if (response.ok) return { ok: true };

  const text = await response.text();
  let unregistered = response.status === 404;
  try {
    const parsed = JSON.parse(text) as { error?: { details?: { errorCode?: string }[]; status?: string } };
    const codes = (parsed.error?.details || []).map((detail) => detail.errorCode);
    if (codes.includes('UNREGISTERED') || parsed.error?.status === 'NOT_FOUND') unregistered = true;
  } catch {
    // Non-JSON error body; keep the status-based guess.
  }
  return { ok: false, unregistered, error: `${response.status}: ${text.slice(0, 300)}` };
}
