process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://hostly:hostly@localhost:5432/hostly_test';
process.env.SMTP_HOST = '';
process.env.APP_URL = 'http://hostly.test';
process.env.REMINDERS_ENABLED = 'false';
