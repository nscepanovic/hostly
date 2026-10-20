import { and, eq } from 'drizzle-orm';
import { normalizePhone, type Language } from '@hostly/shared';
import type { DbOrTx } from '../db/client';
import { customers, type CustomerRow } from '../db/schema';

export interface GuestContact {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  language?: Language | null;
  birthday?: string | null;
}

/**
 * Finds the customer for a reservation (by id, else by normalized phone) in the
 * restaurant's guest book, and creates one when a phone number is given. Fills
 * blanks on an existing customer but never overwrites what staff recorded.
 */
export async function linkCustomer(
  tx: DbOrTx,
  scope: { restaurantId: string; guestBookId: string },
  contact: GuestContact,
  customerId?: string | null,
): Promise<CustomerRow | null> {
  const { restaurantId, guestBookId } = scope;
  let row: CustomerRow | undefined;
  if (customerId) {
    [row] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.guestBookId, guestBookId)));
  }
  const phone = normalizePhone(contact.phone);
  if (!row && phone) {
    [row] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.guestBookId, guestBookId), eq(customers.phone, phone)));
  }
  if (!row) {
    if (!phone) return null;
    // ON CONFLICT covers two hosts creating the same new guest at once.
    const [created] = await tx
      .insert(customers)
      .values({
        guestBookId,
        restaurantId,
        firstName: contact.firstName ?? null,
        lastName: contact.lastName ?? null,
        phone,
        email: contact.email ?? null,
        language: contact.language ?? null,
        birthday: contact.birthday ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    [row] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.guestBookId, guestBookId), eq(customers.phone, phone)));
    return row ?? null;
  }

  const patch: Partial<CustomerRow> = {};
  if (!row.firstName && contact.firstName) patch.firstName = contact.firstName;
  if (!row.lastName && contact.lastName) patch.lastName = contact.lastName;
  if (!row.email && contact.email) patch.email = contact.email;
  if (!row.phone && phone) patch.phone = phone;
  if (!row.language && contact.language) patch.language = contact.language;
  if (contact.birthday && contact.birthday !== row.birthday) patch.birthday = contact.birthday;
  if (Object.keys(patch).length) {
    [row] = await tx.update(customers).set(patch).where(eq(customers.id, row.id)).returning();
  }
  return row;
}
