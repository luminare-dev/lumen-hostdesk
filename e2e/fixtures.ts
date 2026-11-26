import { expect, test as base, type Page } from '@playwright/test';

import { MOCK_API_KEY, MOCK_ORIGIN } from '../src/mock/fixtures';
import { createMockKeyHelp, type MockServer } from '../src/mock/server';

// Every request to the mock panel's address is answered in-process by the mock server; any other
// outside request fails the test, so no real server is ever contacted.
export const test = base.extend<{ mock: MockServer }>({
  mock: async ({ page }, use) => {
    const mock = createMockKeyHelp();
    await page.route(`${MOCK_ORIGIN}/**`, async (route) => {
      const request = route.request();
      const answer = mock.handle({
        method: request.method(),
        url: request.url(),
        headers: request.headers(),
        body: request.postData(),
      });
      await route.fulfill({ status: answer.status, headers: answer.headers, body: answer.body });
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|panel\.example\.net)/, (route) => route.abort('blockedbyclient'));
    await use(mock);
  },
});

export { expect };

/** Opens the app and connects the mock server through the connect screen. */
export async function connect(page: Page, options: { name?: string } = {}): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('screen-connect')).toBeVisible();
  if (options.name) await page.getByTestId('connect-name').fill(options.name);
  await page.getByTestId('connect-url').fill(MOCK_ORIGIN.replace('https://', ''));
  await page.getByTestId('connect-key').fill(MOCK_API_KEY);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('screen-dashboard')).toBeVisible();
}
