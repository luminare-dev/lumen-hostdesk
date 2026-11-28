import type { Page } from '@playwright/test';

import type { MockServer } from '../src/mock/server';
import { connect, expect, test } from './fixtures';

const writes = (mock: MockServer) => mock.log.filter((line) => !line.startsWith('GET '));

/** A wrong text keeps the button disabled, and even a forced click sends nothing. */
async function expectBlocked(page: Page, mock: MockServer, text: string) {
  await page.getByTestId('confirm-typed').fill(text);
  await expect(page.getByTestId('confirm-ok')).toBeDisabled();
  const before = writes(mock).length;
  await page.getByTestId('confirm-ok').click({ force: true });
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  expect(writes(mock)).toHaveLength(before);
}

async function openList(page: Page, kind: string) {
  await page.getByTestId('tab-resources').click();
  await page.getByTestId(`resource-${kind}`).click();
  await expect(page.getByTestId(`screen-list-${kind}`)).toBeVisible();
}

test.describe('deletes with typed confirmation', () => {
  test('deletes a mailbox only after the exact address, and shows a failed delete in place', async ({ page, mock }) => {
    await connect(page);
    await openList(page, 'emails');
    await page.getByTestId('row-emails-21').click();
    await page.getByTestId('email-delete').click();
    await expect(page.getByTestId('confirm-expected')).toHaveText('mara@atelier.example');
    await expect(page.getByTestId('confirm-ok')).toBeDisabled();
    await expectBlocked(page, mock, 'mara@atelier');
    await expectBlocked(page, mock, 'MARA@atelier.example');

    await page.getByTestId('confirm-typed').fill('mara@atelier.example');
    await expect(page.getByTestId('confirm-ok')).toBeEnabled();
    mock.failNext(500);
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('confirm-dialog').getByTestId('error-server')).toBeVisible();
    expect(mock.data.emails.some((e) => e.id === 21)).toBe(true);

    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('screen-list-emails')).toBeVisible();
    await expect(page.getByTestId('row-emails-20')).toBeVisible();
    await expect(page.getByTestId('row-emails-21')).toBeHidden();
    expect(mock.log).toContain('DELETE /emails/21');
    expect(mock.data.emails.some((e) => e.id === 21)).toBe(false);
  });

  test('deletes a domain after typing its name', async ({ page, mock }) => {
    await connect(page);
    await openList(page, 'domains');
    await page.getByTestId('row-domains-12').click();
    await page.getByTestId('domain-delete').click();
    await expectBlocked(page, mock, 'bakery');
    await page.getByTestId('confirm-typed').fill('bakery.example');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('screen-list-domains')).toBeVisible();
    await expect(page.getByTestId('row-domains-10')).toBeVisible();
    await expect(page.getByTestId('row-domains-12')).toBeHidden();
    expect(mock.log).toContain('DELETE /domains/12');
  });

  test('deletes a database after typing its name', async ({ page, mock }) => {
    await connect(page);
    await openList(page, 'databases');
    await page.getByTestId('row-databases-32').click();
    await expect(page.getByTestId('screen-database')).toContainText('bakery_db1');
    await page.getByTestId('database-delete').click();
    await expectBlocked(page, mock, 'bakery_db');
    await page.getByTestId('confirm-typed').fill('bakery_db1');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('screen-list-databases')).toBeVisible();
    await expect(page.getByTestId('row-databases-30')).toBeVisible();
    await expect(page.getByTestId('row-databases-32')).toBeHidden();
    expect(mock.log).toContain('DELETE /databases/32');
  });

  test('shows what goes with a client and deletes it after typing the user name', async ({ page, mock }) => {
    await connect(page);
    await openList(page, 'clients');
    await page.getByTestId('row-clients-3').click();
    await page.getByTestId('client-delete').click();
    const dialog = page.getByTestId('confirm-dialog');
    await expect(dialog).toContainText('2 domain(s)');
    await expect(dialog).toContainText('2 mailbox(es)');
    await expect(dialog).toContainText('1 database(s)');
    await expectBlocked(page, mock, 'Bakery');
    await page.getByTestId('confirm-cancel').click();
    expect(mock.data.clients.some((c) => c.id === 3)).toBe(true);

    await page.getByTestId('client-delete').click();
    await expect(page.getByTestId('confirm-typed')).toHaveValue('');
    await page.getByTestId('confirm-typed').fill('bakery');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('screen-list-clients')).toBeVisible();
    await expect(page.getByTestId('row-clients-3')).toBeHidden();
    expect(mock.log).toContain('DELETE /clients/3');
    expect(mock.data.emails.some((e) => e.id_user === 3)).toBe(false);
  });
});

test.describe('reboot', () => {
  test('reboots only after the host name is typed', async ({ page, mock }) => {
    await connect(page);
    await page.getByTestId('reboot').click();
    await expect(page.getByTestId('confirm-dialog')).toContainText('offline');
    await expectBlocked(page, mock, 'panel.example');
    expect(mock.data.reboots).toBe(0);
    await page.getByTestId('confirm-typed').fill('panel.example.net');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('reboot-sent')).toBeVisible();
    expect(mock.log).toContain('POST /server/reboot');
    expect(mock.data.reboots).toBe(1);
  });
});

test.describe('DNS', () => {
  async function openDns(page: Page) {
    await openList(page, 'domains');
    await page.getByTestId('row-domains-10').click();
    await page.getByTestId('domain-dns').click();
    await expect(page.getByTestId('screen-dns')).toBeVisible();
    await expect(page.getByTestId('dns-record-0')).toContainText('NS');
  }

  test('adds, edits and deletes a record with checks per type', async ({ page, mock }) => {
    await connect(page);
    await openDns(page);
    const other = () => mock.data.dns[10].records?.other ?? [];
    const count = other().length;

    await page.getByTestId('dns-add').click();
    await page.getByTestId('dns-host').fill('app');
    await page.getByTestId('dns-ttl').fill('3600');
    await page.getByTestId('dns-value').fill('192.0.2.300');
    await expect(page.getByTestId('dns-issue')).toContainText('IPv4');
    await expect(page.getByTestId('dns-save')).toBeDisabled();
    await page.getByTestId('dns-type-MX').click();
    await page.getByTestId('dns-value').fill('mail.example.net.');
    await expect(page.getByTestId('dns-issue')).toContainText('priority');
    await page.getByTestId('dns-type-CNAME').click();
    await page.getByTestId('dns-host').fill('@');
    await page.getByTestId('dns-value').fill('target.example.net.');
    await expect(page.getByTestId('dns-issue')).toContainText('CNAME');
    await page.getByTestId('dns-type-NS').click();
    await expect(page.getByTestId('dns-ns-warning')).toBeVisible();
    await page.getByTestId('dns-type-A').click();
    await expect(page.getByTestId('dns-ns-warning')).toBeHidden();
    await page.getByTestId('dns-host').fill('app');
    await page.getByTestId('dns-value').fill('192.0.2.30');
    await expect(page.getByTestId('dns-issue')).toBeHidden();
    await page.getByTestId('dns-save').click();

    await expect(page.getByTestId('screen-dns')).toBeVisible();
    await expect(page.getByTestId(`dns-record-${count}`)).toContainText('192.0.2.30');
    await expect(page.getByTestId('dns-custom')).toBeVisible();
    expect(mock.log).toContain('PUT /dns/10');
    expect(other()).toHaveLength(count + 1);
    expect(other()[count]).toEqual({ host: 'app', ttl: 3600, type: 'A', value: '192.0.2.30' });

    await page.getByTestId(`dns-record-${count}`).click();
    await expect(page.getByTestId('dns-host')).toHaveValue('app');
    await page.getByTestId('dns-ttl').fill('300');
    await page.getByTestId('dns-save').click();
    await expect(page.getByTestId(`dns-record-${count}`)).toContainText('TTL 300');
    expect(other()[count].ttl).toBe(300);

    await page.getByTestId(`dns-record-${count}`).click();
    await page.getByTestId('dns-delete').click();
    await expectBlocked(page, mock, 'ap');
    await page.getByTestId('confirm-typed').fill('app');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('screen-dns')).toBeVisible();
    await expect(page.getByTestId(`dns-record-${count}`)).toBeHidden();
    expect(other()).toHaveLength(count);
  });

  test('refuses a CNAME next to another record at the same name', async ({ page, mock }) => {
    void mock;
    await connect(page);
    await openDns(page);
    await page.getByTestId('dns-add').click();
    await page.getByTestId('dns-type-CNAME').click();
    await page.getByTestId('dns-host').fill('*');
    await page.getByTestId('dns-value').fill('@');
    await expect(page.getByTestId('dns-issue')).toContainText('only record');
    await expect(page.getByTestId('dns-save')).toBeDisabled();
  });

  test('edits the SOA with a warning, then resets the zone', async ({ page, mock }) => {
    await connect(page);
    await openDns(page);
    await page.getByTestId('dns-soa-edit').click();
    await expect(page.getByTestId('dns-soa-warning')).toBeVisible();
    await page.getByTestId('soa-retry').fill('0');
    await expect(page.getByTestId('dns-issue')).toBeVisible();
    await expect(page.getByTestId('dns-save')).toBeDisabled();
    await page.getByTestId('soa-retry').fill('900');
    await page.getByTestId('dns-save').click();
    await expect(page.getByTestId('dns-soa')).toContainText('retry 900');
    expect(mock.data.dns[10].records?.soa?.retry).toBe(900);

    await page.getByTestId('dns-reset').click();
    await expectBlocked(page, mock, 'atelier');
    await page.getByTestId('confirm-typed').fill('atelier.example');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('dns-soa')).toContainText('retry 1800');
    await expect(page.getByTestId('dns-reset')).toBeHidden();
    expect(mock.log).toContain('DELETE /dns/10');
  });
});

test.describe('read-only mode', () => {
  const serverChoice = (page: Page, value: 'default' | 'on' | 'off') =>
    page.locator(`[data-testid^="server-read-only-"][data-testid$="-${value}"]`).first();

  test('hides every write action for a read-only server and asks before allowing changes again', async ({ page, mock }) => {
    await connect(page);
    await expect(page.getByTestId('read-only-badge')).toBeHidden();
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('settings-servers').click();
    await serverChoice(page, 'on').click();
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
    await expect(page.getByTestId('read-only-badge')).toBeVisible();

    await page.getByTestId('tab-dashboard').click();
    await expect(page.getByTestId('card-server')).toBeVisible();
    await expect(page.getByTestId('read-only-badge')).toBeVisible();
    await expect(page.getByTestId('reboot')).toBeHidden();

    await openList(page, 'emails');
    await expect(page.getByTestId('create')).toBeHidden();
    await page.getByTestId('row-emails-20').click();
    await expect(page.getByTestId('email-quota')).toBeVisible();
    await expect(page.getByTestId('email-delete')).toBeHidden();
    await expect(page.getByTestId('email-reset')).toBeHidden();

    await page.getByTestId('tab-resources').click();
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-clients').click();
    await page.getByTestId('row-clients-2').click();
    await expect(page.getByTestId('client-state')).toBeVisible();
    await expect(page.getByTestId('client-edit')).toBeHidden();
    await expect(page.getByTestId('client-toggle')).toBeHidden();
    await expect(page.getByTestId('client-delete')).toBeHidden();

    await page.getByTestId('tab-resources').click();
    await page.getByTestId('tab-resources').click();
    await page.getByTestId('resource-domains').click();
    await page.getByTestId('row-domains-10').click();
    await expect(page.getByTestId('domain-delete')).toBeHidden();
    await expect(page.getByTestId('domain-toggle')).toBeHidden();
    await page.getByTestId('domain-dns').click();
    await expect(page.getByTestId('dns-record-0')).toBeVisible();
    await expect(page.getByTestId('dns-add')).toBeHidden();
    await expect(page.getByTestId('dns-soa-edit')).toBeHidden();
    expect(writes(mock)).toEqual([]);

    // Allowing changes again asks first (on the web there is no device check, so a dialog does).
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('settings-servers').click();
    await serverChoice(page, 'off').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('read-only-badge')).toBeVisible();
    await serverChoice(page, 'off').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('read-only-badge')).toBeHidden();

    await page.getByTestId('tab-dashboard').click();
    await expect(page.getByTestId('reboot')).toBeVisible();
  });

  test('follows the global default for servers without their own setting', async ({ page, mock }) => {
    await connect(page);
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('read-only-default-on').click();
    await expect(page.getByTestId('read-only-badge')).toBeVisible();
    await page.getByTestId('tab-dashboard').click();
    await expect(page.getByTestId('reboot')).toBeHidden();

    await page.getByTestId('tab-settings').click();
    await page.getByTestId('read-only-default-off').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('read-only-badge')).toBeHidden();
    expect(writes(mock)).toEqual([]);
  });
});
