import type { AuthError } from './auth';

export function messageFor(error: AuthError, t: (k: string) => string) {
  if (error === 'offline') return t('common.offline');
  if (error === 'wrong_code') return t('verify.wrongCode');
  if (error === 'expired') return t('verify.expired');
  return t('common.genericError');
}
