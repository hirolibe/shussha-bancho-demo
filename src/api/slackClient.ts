import { STATUS_EMOJI, STATUS_TEXT } from '../config/constants';

export class SlackError extends Error {
  readonly slackError: string | undefined;
  readonly httpStatus: number | undefined;
  readonly retryAfterSec: number | undefined;

  constructor(
    message: string,
    options?: { slackError?: string; httpStatus?: number; retryAfterSec?: number },
  ) {
    super(message);
    this.name = 'SlackError';
    this.slackError = options?.slackError;
    this.httpStatus = options?.httpStatus;
    this.retryAfterSec = options?.retryAfterSec;
  }
}

const BASE_URL = 'https://slack.com/api';

async function callSlack<T>(method: string, token: string, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new SlackError(`ネットワークエラー: ${message}`);
  }

  if (res.status === 429) {
    const retryHeader = res.headers.get('retry-after') ?? res.headers.get('Retry-After');
    const retry = retryHeader ? Number.parseInt(retryHeader, 10) : undefined;
    throw new SlackError('Slack レート制限 (429)', {
      slackError: 'ratelimited',
      httpStatus: 429,
      retryAfterSec: Number.isFinite(retry) ? retry : undefined,
    });
  }

  let json: { ok?: boolean; error?: string } & Record<string, unknown>;
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new SlackError(`Slack 応答が JSON ではない (status=${res.status})`, {
      httpStatus: res.status,
    });
  }

  if (!json.ok) {
    throw new SlackError(`Slack API エラー: ${json.error ?? 'unknown'}`, {
      slackError: json.error,
      httpStatus: res.status,
    });
  }
  return json as T;
}

export type AuthTestResponse = {
  ok: true;
  user: string;
  user_id: string;
  team: string;
  team_id: string;
  url: string;
};

export async function authTest(token: string): Promise<AuthTestResponse> {
  return callSlack<AuthTestResponse>('auth.test', token);
}

export type ProfileSetResponse = { ok: true };

export type SetStatusInput = {
  /** Phase 1 既定: ":kinmu:" */
  statusEmoji?: string;
  /** Phase 1 既定: "出社中" */
  statusText?: string;
  /** Unix epoch (秒). 0 で自動クリアなし */
  statusExpiration?: number;
};

export async function setKinmuStatus(token: string, input?: SetStatusInput): Promise<ProfileSetResponse> {
  return callSlack<ProfileSetResponse>('users.profile.set', token, {
    profile: {
      status_text: input?.statusText ?? STATUS_TEXT,
      status_emoji: input?.statusEmoji ?? STATUS_EMOJI,
      status_expiration: input?.statusExpiration ?? 0,
    },
  });
}

export type ProfileGetResponse = {
  ok: true;
  profile: {
    status_text: string;
    status_emoji: string;
    status_expiration?: number;
    real_name?: string;
    display_name?: string;
  };
};

export async function getCurrentProfile(token: string): Promise<ProfileGetResponse> {
  return callSlack<ProfileGetResponse>('users.profile.get', token);
}

/**
 * 現在ステータスが既に :kinmu: かどうかを Slack に問い合わせる二重ガード（任意）。
 * Phase 1 §5.4 参照。
 */
export async function isAlreadyKinmu(token: string): Promise<boolean> {
  const res = await getCurrentProfile(token);
  return res.profile.status_emoji === STATUS_EMOJI;
}
