/* اختبارات المتصفح — خادم تطوير بقاعدة مستقلة (.data/e2e.db) وبيئة تجريبية كاملة:
   بوابة الدفع التجريبية، وصندوق الرسائل التجريبي (رموز الدخول تُقرأ من سجل الرسائل في اللوحة)، ودخول كلمة المرور للفريق.
   npm run test:e2e */
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3300)
const BASE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  /* قاعدة واحدة مشتركة — الملفات بالتتابع */
  workers: 1,
  fullyParallel: false,
  /* خادم التطوير يترجم كل صفحة عند أول زيارة */
  timeout: 240_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    navigationTimeout: 60_000,
    /* التتبّع عند إعادة المحاولة وحدها — تسجيل كل اختبار يكلّف ثلث وقت التشغيل */
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 900 },
  },
  webServer: {
    command: `node scripts/setup-fonts.mjs && tsx scripts/db-setup.ts --reset && next dev -p ${PORT}`,
    url: `${BASE}/`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: 'file:.data/e2e.db',
      ADMIN_PASSWORD: 'e2e-pass-123',
      ADMIN_SECRET: 'e2e-admin-secret-e2e-admin-secret-xx',
      LEARNER_SECRET: 'e2e-learner-secret-e2e-learner-secret',
      CRON_SECRET: 'e2e-cron-secret-e2e-cron-secret',
      PAYMENTS_GATEWAY: 'mock',
      STREAM_MOCK: '1',
      STREAM_MOCK_TUS_ABOVE: '2000000',
      SITE_URL: BASE,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
