// Invented data in the shape of the KeyHelp API's documented answers, for the tests, the e2e run
// and the screenshots. Names use the reserved example domains (RFC 2606); no real server, person
// or key is in here. Dates are relative to `now`, so a certificate is always "about to expire".

import type {
  BackupOperation,
  Certificate,
  Client,
  Database,
  DnsSettings,
  Domain,
  EmailAccount,
  FtpUser,
  HostingPlan,
  ScheduledTask,
  ServerInfo,
} from '../api/types';

/** The API key the mock server accepts. Not a secret: it only opens the mock. */
export const MOCK_API_KEY = 'mock-key';
/** The address the e2e run and the screenshots connect to; Playwright answers it from the mock. */
export const MOCK_ORIGIN = 'https://panel.example.net';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

export interface MockData {
  server: ServerInfo;
  plans: HostingPlan[];
  clients: Client[];
  domains: Domain[];
  certificates: Certificate[];
  emails: EmailAccount[];
  databases: Database[];
  ftpUsers: FtpUser[];
  scheduledTasks: ScheduledTask[];
  backups: BackupOperation[];
  /** DNS settings per main domain id. */
  dns: Record<number, DnsSettings>;
  /** How often POST /server/reboot was accepted. */
  reboots: number;
}

/** The zone KeyHelp starts a main domain with (its default template, with example addresses). */
export function defaultDns(): DnsSettings {
  return {
    is_custom_dns: false,
    is_dns_disabled: false,
    dkim_record: 'default._domainkey IN TXT ( "v=DKIM1; k=rsa; s=email; " "p=MOCKDKIMKEY" )',
    records: {
      soa: {
        ttl: 86400,
        primary_ns: 'ns1.example.net.',
        rname: 'hostmaster.example.net.',
        refresh: 14400,
        retry: 1800,
        expire: 604800,
        minimum: 3600,
      },
      other: [
        { host: '@', ttl: 86400, type: 'NS', value: 'ns1.example.net.' },
        { host: '@', ttl: 86400, type: 'NS', value: 'ns2.example.net.' },
        { host: '@', ttl: 86400, type: 'MX', value: '10 mail' },
        { host: '@', ttl: 86400, type: 'TXT', value: 'v=spf1 a mx -all' },
        { host: '_dmarc', ttl: 86400, type: 'TXT', value: 'v=DMARC1; p=none' },
        { host: 'default._domainkey', ttl: 86400, type: 'TXT', value: '<DKIM_RECORD_VALUE>' },
        { host: '@', ttl: 86400, type: 'A', value: '192.0.2.10' },
        { host: '*', ttl: 86400, type: 'A', value: '192.0.2.10' },
        { host: '@', ttl: 86400, type: 'AAAA', value: '2001:db8::10' },
        { host: '*', ttl: 86400, type: 'AAAA', value: '2001:db8::10' },
      ],
    },
  };
}

const days = (now: Date, n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

export function createFixtures(now: Date = new Date()): MockData {
  const server: ServerInfo = {
    meta: {
      hostname: 'panel.example.net',
      ip_addresses: ['192.0.2.10', '2001:db8::10'],
      server_time: now.toISOString(),
      uptime: { days: 41, hours: 6, minutes: 12, seconds: 9 },
      panel_version: '25.2.1',
      panel_build: 3101,
      api_version: '2.15',
    },
    operating_system: {
      label: 'Debian 12 (64-bit)',
      end_of_life: false,
      updates: { update_count: 7, security_update_count: 2, reboot_required: false },
    },
    utilization: {
      process_count: 182,
      emails_in_queue: 3,
      load: { minute_1: 0.62, minute_5: 0.48, minute_15: 0.41, cpu_count: 4, percent: 15.5, level: 'low' },
      disk_space: { free: 57 * GiB, used: 103 * GiB, total: 160 * GiB, percent: 64.38 },
      inodes: { free: 9_200_000, used: 800_000, total: 10_000_000, percent: 8 },
      memory: { free: 3.4 * GiB, used: 4.6 * GiB, total: 8 * GiB, percent: 57.5 },
      swap: { free: 1.9 * GiB, used: 0.1 * GiB, total: 2 * GiB, percent: 5 },
    },
    resources: {
      admin_accounts: 1,
      client_accounts: 3,
      domains: 5,
      subdomains: 1,
      email_accounts: 5,
      databases: 3,
      ftp_users: 2,
      scheduled_tasks: 2,
    },
    components: {
      kernel: '6.1.0-28-amd64',
      apache: '2.4.62',
      php: '8.3.14',
      mariadb: '10.11.6',
      proftpd: '1.3.8',
      dovecot: '2.3.19',
      postfix: '3.7.11',
    },
    ports: [
      { service: 'SSH', port: 22, protocol: 'tcp', status: 'online' },
      { service: 'FTP', port: 21, protocol: 'tcp', status: 'offline' },
      { service: 'HTTP', port: 80, protocol: 'tcp', status: 'online' },
      { service: 'HTTPS', port: 443, protocol: 'tcp', status: 'online' },
      { service: 'SMTP', port: 25, protocol: 'tcp', status: 'online' },
      { service: 'Submission', port: 587, protocol: 'tcp', status: 'online' },
      { service: 'IMAPS', port: 993, protocol: 'tcp', status: 'online' },
      { service: 'MySQL', port: 3306, protocol: 'tcp', status: 'online' },
    ],
  };

  const plans: HostingPlan[] = [
    { id: 1, name: 'Default' },
    { id: 2, name: 'Small' },
    { id: 3, name: 'Business' },
  ];

  const clients: Client[] = [
    {
      id: 2,
      status: 1,
      username: 'atelier',
      language: 'de',
      email: 'office@atelier.example',
      notes: 'Design studio, two sites.',
      id_hosting_plan: 3,
      created_at: days(now, -400),
      is_suspended: false,
      contact_data: { first_name: 'Mara', last_name: 'Lind', company: 'Atelier Lind' },
    },
    {
      id: 3,
      status: 1,
      username: 'bakery',
      language: 'en',
      email: 'hello@bakery.example',
      notes: '',
      id_hosting_plan: 2,
      created_at: days(now, -210),
      is_suspended: false,
      contact_data: { first_name: 'Theo', last_name: 'Brandt', company: 'Corner Bakery' },
    },
    {
      id: 4,
      status: 1,
      username: 'club',
      language: 'de',
      email: 'board@club.example',
      notes: 'Paused until the new board takes over.',
      id_hosting_plan: 2,
      created_at: days(now, -90),
      is_suspended: true,
      contact_data: { first_name: 'Ida', last_name: 'Kern', company: 'Rowing Club' },
    },
  ];

  const domains: Domain[] = [
    {
      id: 10,
      id_user: 2,
      id_parent_domain: 0,
      status: 1,
      domain: 'atelier.example',
      domain_utf8: 'atelier.example',
      created_at: days(now, -400),
      is_disabled: false,
      is_subdomain: false,
      is_email_domain: true,
      security: { id_certificate: 100, lets_encrypt: true, force_https: true, is_hsts: true },
    },
    {
      id: 11,
      id_user: 2,
      id_parent_domain: 10,
      status: 1,
      domain: 'portfolio.atelier.example',
      domain_utf8: 'portfolio.atelier.example',
      created_at: days(now, -120),
      is_disabled: false,
      is_subdomain: true,
      is_email_domain: false,
      security: { id_certificate: 101, lets_encrypt: true, force_https: true, is_hsts: false },
    },
    {
      id: 12,
      id_user: 3,
      id_parent_domain: 0,
      status: 1,
      domain: 'bakery.example',
      domain_utf8: 'bakery.example',
      created_at: days(now, -210),
      is_disabled: false,
      is_subdomain: false,
      is_email_domain: true,
      security: { id_certificate: 102, lets_encrypt: false, force_https: true, is_hsts: false },
    },
    {
      id: 13,
      id_user: 4,
      id_parent_domain: 0,
      status: 1,
      domain: 'club.example',
      domain_utf8: 'club.example',
      created_at: days(now, -90),
      is_disabled: true,
      is_subdomain: false,
      is_email_domain: true,
      security: { id_certificate: 0, lets_encrypt: false, force_https: false, is_hsts: false },
    },
    {
      id: 14,
      id_user: 3,
      id_parent_domain: 0,
      status: 2,
      domain: 'xn--bckerei-5wa.example',
      domain_utf8: 'bäckerei.example',
      created_at: days(now, -30),
      is_disabled: false,
      is_subdomain: false,
      is_email_domain: false,
      target: { target: 'https://bakery.example', is_forwarding: true },
      security: { id_certificate: 103, lets_encrypt: true, force_https: true, is_hsts: false },
    },
  ];

  const certificates: Certificate[] = [
    {
      id: 100,
      id_user: 2,
      name: "Let's Encrypt atelier.example",
      secured_domains: ['atelier.example', 'www.atelier.example'],
      valid_till: days(now, 58),
      issuer: "Let's Encrypt / R11",
    },
    {
      id: 101,
      id_user: 2,
      name: "Let's Encrypt portfolio.atelier.example",
      secured_domains: ['portfolio.atelier.example'],
      valid_till: days(now, 71),
      issuer: "Let's Encrypt / R10",
    },
    {
      id: 102,
      id_user: 3,
      name: 'Bakery (bought)',
      secured_domains: ['bakery.example', 'www.bakery.example'],
      valid_till: days(now, 9),
      issuer: 'Example Trust CA',
    },
    {
      id: 103,
      id_user: 3,
      name: "Let's Encrypt bäckerei.example",
      secured_domains: ['xn--bckerei-5wa.example'],
      valid_till: days(now, -2),
      issuer: "Let's Encrypt / R11",
    },
  ];

  const emails: EmailAccount[] = [
    {
      id: 20,
      id_user: 2,
      id_domain: 10,
      status: 1,
      email: 'office@atelier.example',
      email_utf8: 'office@atelier.example',
      description: 'Main inbox',
      size: 1.7 * GiB,
      max_size: 2 * GiB,
      aliases: ['hello@atelier.example'],
      forwardings: [],
    },
    {
      id: 21,
      id_user: 2,
      id_domain: 10,
      status: 1,
      email: 'mara@atelier.example',
      email_utf8: 'mara@atelier.example',
      description: '',
      size: 312 * MiB,
      max_size: 2 * GiB,
      aliases: [],
      forwardings: [],
    },
    {
      id: 22,
      id_user: 3,
      id_domain: 12,
      status: 1,
      email: 'hello@bakery.example',
      email_utf8: 'hello@bakery.example',
      description: 'Orders',
      size: 96 * MiB,
      max_size: 1 * GiB,
      aliases: ['orders@bakery.example'],
      forwardings: ['theo@example.net'],
    },
    {
      id: 23,
      id_user: 3,
      id_domain: 12,
      status: 1,
      email: 'theo@bakery.example',
      email_utf8: 'theo@bakery.example',
      description: '',
      size: 12 * MiB,
      max_size: 0,
      aliases: [],
      forwardings: [],
    },
    {
      id: 24,
      id_user: 4,
      id_domain: 13,
      status: 1,
      email: 'board@club.example',
      email_utf8: 'board@club.example',
      description: 'Board',
      size: 480 * MiB,
      max_size: 512 * MiB,
      aliases: [],
      forwardings: [],
    },
  ];

  const databases: Database[] = [
    {
      id: 30,
      id_user: 2,
      database_name: 'atelier_wp',
      database_username: 'atelier_wp',
      description: 'Website',
      size: 184 * MiB,
      remote_hosts: [],
    },
    {
      id: 31,
      id_user: 2,
      database_name: 'atelier_portfolio',
      database_username: 'atelier_portfolio',
      description: 'Portfolio',
      size: 402 * MiB,
      remote_hosts: ['198.51.100.7'],
    },
    {
      id: 32,
      id_user: 3,
      database_name: 'bakery_db1',
      database_username: 'bakery_db1',
      description: '',
      size: 23 * MiB,
      remote_hosts: [],
    },
  ];

  const ftpUsers: FtpUser[] = [
    { id: 40, id_user: 2, status: 1, username: 'atelier_ftp1', description: 'Photo uploads', home_directory: '/www/media/' },
    { id: 41, id_user: 3, status: 1, username: 'bakery_ftp1', description: '', home_directory: '/' },
  ];

  const scheduledTasks: ScheduledTask[] = [
    {
      id: 50,
      id_user: 2,
      status: 1,
      type: 'php',
      command: '/home/users/atelier/www/wp-cron.php',
      description: 'WordPress cron',
      schedule: { minute: '*/15', hour: '*', day_of_month: '*', month: '*', day_of_week: '*' },
    },
    {
      id: 51,
      id_user: 3,
      status: 2,
      type: 'url',
      command: 'https://bakery.example/tasks/sitemap',
      description: 'Sitemap',
      schedule: { minute: '0', hour: '3', day_of_month: '*', month: '*', day_of_week: '1' },
    },
  ];

  const backups: BackupOperation[] = [
    {
      id_user: 2,
      id_repository: 1,
      type: 'backup',
      state: 'finished',
      progress: 100,
      description: 'Nightly backup',
      size_change: 48 * MiB,
      started_at: days(now, -1),
      ended_at: days(now, -0.98),
    },
    {
      id_user: 3,
      id_repository: 1,
      type: 'backup',
      state: 'failed',
      progress: 37.5,
      messages: 'Repository not reachable',
      description: 'Nightly backup',
      size_change: 0,
      started_at: days(now, -1),
      ended_at: days(now, -0.99),
    },
    {
      id_user: 2,
      id_repository: 1,
      type: 'backup',
      state: 'finished',
      progress: 100,
      description: 'Nightly backup',
      size_change: 52 * MiB,
      started_at: days(now, -2),
      ended_at: days(now, -1.98),
    },
  ];

  const dns: Record<number, DnsSettings> = {};
  for (const domain of domains) if (!domain.is_subdomain) dns[domain.id] = defaultDns();

  return { server, plans, clients, domains, certificates, emails, databases, ftpUsers, scheduledTasks, backups, dns, reboots: 0 };
}
