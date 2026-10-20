import { emailIndex, guestSearchTokens, phoneIndex } from '../common/crypto';

/**
 * Blind-index columns for a customer, computed from its plaintext fields.
 * Every insert or update of a customer's name, phone or email must include these.
 */
export function customerIndexes(c: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null }) {
  return {
    phoneIndex: phoneIndex(c.phone),
    emailIndex: emailIndex(c.email),
    searchTokens: guestSearchTokens(c),
  };
}
