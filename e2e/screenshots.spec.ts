import { connect, expect, test } from './fixtures';

// Phone-size screenshots in dark and light for the visual check (CI artifact "screenshots");
// a few of them are copied to docs/screenshots/ for the README. Run with SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'screenshots only with SCREENSHOTS=1');

for (const scheme of ['dark', 'light'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });

    test(`screens (${scheme})`, async ({ page, mock }) => {
      void mock;
      const shot = (name: string) => page.screenshot({ path: `screenshots/${name}-${scheme}.png` });

      await page.goto('/');
      await expect(page.getByTestId('screen-connect')).toBeVisible();
      await shot('connect');

      await connect(page, { name: 'Main server' });
      await expect(page.getByTestId('meter-disk')).toBeVisible();
      await shot('dashboard');

      await page.getByTestId('tab-resources').click();
      await shot('accounts');
      await page.getByTestId('resource-clients').click();
      await expect(page.getByTestId('row-clients-2')).toBeVisible();
      await shot('clients');
      await page.getByTestId('row-clients-2').click();
      await expect(page.getByTestId('client-state')).toBeVisible();
      await shot('client');
      await page.getByTestId('back').click();
      await page.getByTestId('back').click();
      await page.getByTestId('resource-domains').click();
      await expect(page.getByTestId('row-domains-12')).toBeVisible();
      await shot('domains');
      await page.getByTestId('back').click();
      await page.getByTestId('resource-emails').click();
      await page.getByTestId('row-emails-20').click();
      await expect(page.getByTestId('email-quota')).toBeVisible();
      await page.getByTestId('email-reset').click();
      await expect(page.getByTestId('confirm-dialog')).toBeVisible();
      await shot('confirm');
      await page.getByTestId('confirm-cancel').click();

      await page.getByTestId('tab-alerts').click();
      await expect(page.getByTestId('alert-service')).toBeVisible();
      await shot('alerts');

      await page.getByTestId('tab-settings').click();
      await shot('settings');

      // The write flows: typed confirmation, DNS editor, read-only badge.
      await page.getByTestId('tab-resources').click();
      await page.getByTestId('tab-resources').click();
      await page.getByTestId('resource-domains').click();
      await page.getByTestId('row-domains-10').click();
      await page.getByTestId('domain-dns').click();
      await expect(page.getByTestId('dns-record-0')).toBeVisible();
      await shot('dns');
      await page.getByTestId('dns-add').click();
      await page.getByTestId('dns-type-MX').click();
      await page.getByTestId('dns-host').fill('@');
      await page.getByTestId('dns-value').fill('mail.example.net.');
      await expect(page.getByTestId('dns-issue')).toBeVisible();
      await shot('dns-record');
      await page.getByTestId('tab-resources').click();
      await page.getByTestId('resource-clients').click();
      await page.getByTestId('row-clients-2').click();
      await page.getByTestId('client-delete').click();
      await page.getByTestId('confirm-typed').fill('atel');
      await shot('delete');
      await page.getByTestId('confirm-cancel').click();

      await page.getByTestId('tab-settings').click();
      await page.getByTestId('settings-servers').click();
      await page.locator('[data-testid^="server-read-only-"][data-testid$="-on"]').first().click();
      await page.getByTestId('tab-dashboard').click();
      await expect(page.getByTestId('read-only-badge')).toBeVisible();
      await shot('read-only');
    });
  });
}
