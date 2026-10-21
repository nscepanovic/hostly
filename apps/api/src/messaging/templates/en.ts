import type { MessageLocale } from './types';

/** English guest messages. Also the fallback for languages without their own file. */
const en: MessageLocale = {
  guestFallback: 'guest',
  links: { confirm: 'Confirm attendance', cancel: 'Cancel reservation', manage: 'View reservation' },
  templates: {
    request_received: (v) => ({
      subject: `We received your request — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `we received your reservation request: ${v.date} at ${v.time}, ${v.covers} guests.`, 'We will let you know as soon as the restaurant confirms it.'],
      links: ['cancel'],
    }),
    confirmed: (v) => ({
      subject: `Reservation confirmed — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `your reservation is confirmed: ${v.date} at ${v.time}, ${v.covers} guests.`, 'We look forward to seeing you!'],
      links: ['confirm', 'cancel'],
    }),
    declined: (v) => ({
      subject: `Reservation not possible — ${v.restaurantName}`,
      lines: [
        `Dear ${v.guestName},`,
        `unfortunately we cannot accept your request for ${v.date} at ${v.time}.`,
        ...(v.reason ? [`Reason: ${v.reason}`] : []),
        v.restaurantPhone ? `Call us at ${v.restaurantPhone} to find another time.` : 'Please try another time.',
      ],
      links: [],
    }),
    reminder: (v) => ({
      subject: `Reminder: tomorrow at ${v.time} — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `a reminder of your reservation tomorrow, ${v.date} at ${v.time}, ${v.covers} guests.`, 'If you cannot make it, please cancel.'],
      links: ['confirm', 'cancel'],
    }),
    cancelled: (v) => ({
      subject: `Reservation cancelled — ${v.restaurantName}`,
      lines: [`Dear ${v.guestName},`, `your reservation for ${v.date} at ${v.time} has been cancelled.`],
      links: [],
    }),
  },
};

export default en;
