import { MOCK_ORIGIN } from '../src/mock/fixtures';
import { connect, expect, test } from './fixtures';

test.describe('connect', () => {
  test('warns that the key is session-only on the web', async ({ page, mock }) => {
    void mock;
    await page.goto('/');
    await expect(page.getByTestId('web-key-warning')).toContainText('only for this browser tab');
  });

  test('refuses http:// before sending anything', async ({ page, mock }) => {
    await page.goto('/');
    await page.getByTestId('connect-url').fill('http://panel.example.net');
    await page.getByTestId('connect-key').fill('anything');
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('error-insecure')).toBeVisible();
    expect(mock.log).toEqual([]);
  });

  test('explains a rejected key', async ({ page, mock }) => {
    void mock;
    await page.goto('/');
    await page.getByTestId('connect-url').fill(MOCK_ORIGIN);
    await page.getByTestId('connect-key').fill('wrong-key');
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('error-unauthorized')).toBeVisible();
  });

  test('explains an unreachable server', async ({ page, mock }) => {
    void mock;
    await page.goto('/');
    await page.getByTestId('connect-url').fill('unreachable.example.org');
    await page.getByTestId('connect-key').fill('anything');
    await page.getByTestId('connect-submit').click();
    await expect(page.getByTestId('error-network')).toBeVisible();
  });

  test('connects and shows the server status', async ({ page, mock }) => {
    await connect(page, { name: 'Main' });
    await expect(page.getByTestId('card-server')).toContainText('panel.example.net');
    await expect(page.getByTestId('meter-disk')).toContainText('64 %');
    await expect(page.getByTestId('service-FTP')).toContainText('offline');
    await expect(page.getByTestId('service-SSH')).toContainText('online');
    expect(mock.log).toContain('GET /ping');
    expect(mock.log).toContain('GET /server');
  });

  test('keeps the server after a reload (same tab session)', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.reload();
    await expect(page.getByTestId('card-server')).toContainText('panel.example.net');
  });
});

test.describe('accounts', () => {
  test('lists and searches clients, then opens one', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-clients').click();
    await expect(page.getByTestId('row-clients-2')).toBeVisible();
    await expect(page.getByTestId('row-clients-4')).toContainText('Disabled');
    await page.getByTestId('search').fill('bakery');
    await expect(page.getByTestId('row-clients-2')).toBeHidden();
    await expect(page.getByTestId('row-clients-3')).toBeVisible();
    await page.getByTestId('search').fill('nobody-here');
    await expect(page.getByTestId('list-empty')).toContainText('nobody-here');
    await page.getByTestId('search').fill('');
    await page.getByTestId('row-clients-3').click();
    await expect(page.getByTestId('screen-client')).toContainText('hello@bakery.example');
  });

  test('disables a client only after confirming', async ({ page, mock }) => {
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-clients').click();
    await page.getByTestId('row-clients-3').click();
    await page.getByTestId('client-toggle').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    expect(mock.data.clients.find((c) => c.id === 3)?.is_suspended).toBe(false);
    await page.getByTestId('client-toggle').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('client-state')).toContainText('Disabled');
    expect(mock.data.clients.find((c) => c.id === 3)?.is_suspended).toBe(true);
  });

  test('shows certificate state on domains', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-domains').click();
    await expect(page.getByTestId('row-domains-12')).toContainText('Expires in 9 days');
    await expect(page.getByTestId('row-domains-14')).toContainText('Expired');
    await expect(page.getByTestId('row-domains-13')).toContainText('Disabled');
    await page.getByTestId('row-domains-12').click();
    await expect(page.getByTestId('domain-certificate')).toContainText('Example Trust CA');
  });

  test('creates a domain for a client', async ({ page, mock }) => {
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-domains').click();
    await page.getByTestId('create').click();
    await page.getByTestId('owner-bakery').click();
    await page.getByTestId('domain-name').fill('bakery-two.example');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('screen-list-domains')).toBeVisible();
    await expect(page.getByText('bakery-two.example')).toBeVisible();
    expect(mock.data.domains.some((d) => d.domain === 'bakery-two.example' && d.id_user === 3)).toBe(true);
  });

  test('shows a server error from a create form', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-clients').click();
    await page.getByTestId('create').click();
    await page.getByTestId('client-username').fill('atelier');
    await page.getByTestId('client-email').fill('new@atelier.example');
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('error-badRequest')).toContainText('already in use');
  });

  test('resets a mailbox password and shows the generated one once', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-emails').click();
    await page.getByTestId('row-emails-20').click();
    await expect(page.getByTestId('email-quota')).toContainText('85 %');
    await page.getByTestId('email-reset').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('generated-password')).toHaveText(/^mock-generated-\d+$/);
    await page.getByTestId('generated-done').click();
    await expect(page.getByTestId('generated')).toBeHidden();
  });

  test('creates a database with server-chosen names', async ({ page, mock }) => {
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-databases').click();
    await page.getByTestId('create').click();
    await page.getByTestId('owner-club').click();
    await page.getByTestId('form-submit').click();
    await expect(page.getByTestId('generated')).toContainText('club_db1');
    expect(mock.data.databases.some((d) => d.database_name === 'club_db1')).toBe(true);
  });

  test('lists FTP users, scheduled tasks and backups', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-ftp').click();
    await expect(page.getByTestId('row-ftp-40')).toContainText('atelier_ftp1');
    await page.getByTestId('back').click();
    await page.getByTestId('resource-cron').click();
    await expect(page.getByTestId('row-cron-51')).toContainText('Last run failed');
    await page.getByTestId('back').click();
    await page.getByTestId('resource-backups').click();
    await expect(page.getByText('Failed')).toBeVisible();
  });
});

test.describe('alerts and settings', () => {
  test('lists the alerts of the mock server', async ({ page, mock }) => {
    void mock;
    await connect(page, { name: 'Main' });
    await page.getByTestId('tab-alerts').click();
    await expect(page.getByTestId('alert-service')).toContainText('Main: FTP (port 21) is offline');
    await expect(page.getByTestId('alert-certificateExpired')).toBeVisible();
    await expect(page.getByTestId('alert-certificateExpiring')).toContainText('9 days');
    await expect(page.getByTestId('alert-quota')).toContainText('board@club.example');
    await expect(page.getByTestId('alert-backup')).toBeVisible();
  });

  test('switches to German', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('language-de').click();
    await expect(page.getByTestId('tab-settings')).toContainText('Einstellungen');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('imports a token file and reports the invalid values', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('tokens-import').click();
    await page.getByTestId('tokens-json').fill('{"color":{"dark":{"accent":"#FF8800","text":"red"}}}');
    await page.getByTestId('tokens-apply').click();
    await expect(page.getByTestId('tokens-result')).toContainText('color.dark.text');
    await page.getByTestId('tokens-json').fill('not json');
    await page.getByTestId('tokens-apply').click();
    await expect(page.getByTestId('tokens-result')).toContainText('not valid JSON');
  });
});
