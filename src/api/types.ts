// Types for the parts of the KeyHelp REST API (v2.15) the app reads and writes. Field names and
// shapes follow the API's OpenAPI document; see docs/api.md for the endpoint list. Every field the
// app does not need is left out, and every field is optional where the API may omit it.

/** `status` of an object: 0 unknown, 1 okay, 2 error, 3 config_new, 4 config_update. */
export type ObjectStatus = 0 | 1 | 2 | 3 | 4;

export interface UsageBlock {
  free: number;
  used: number;
  total: number;
  percent: number;
}

export interface ServerPort {
  service: string;
  port: number;
  protocol: string;
  /** "online" or "offline". */
  status: string;
}

export interface ServerInfo {
  meta?: {
    hostname?: string;
    ip_addresses?: string[];
    server_time?: string;
    uptime?: { days: number; hours: number; minutes: number; seconds: number };
    panel_version?: string;
    panel_build?: number;
    api_version?: string;
  };
  operating_system?: {
    label?: string;
    end_of_life?: boolean;
    updates?: { update_count: number; security_update_count: number; reboot_required: boolean };
  };
  utilization?: {
    process_count?: number;
    emails_in_queue?: number;
    load?: {
      minute_1: number;
      minute_5: number;
      minute_15: number;
      cpu_count: number;
      percent: number;
      level: string;
    };
    disk_space?: UsageBlock;
    inodes?: UsageBlock;
    memory?: UsageBlock;
    swap?: UsageBlock;
  };
  resources?: {
    admin_accounts?: number;
    client_accounts?: number;
    domains?: number;
    subdomains?: number;
    email_accounts?: number;
    databases?: number;
    ftp_users?: number;
    scheduled_tasks?: number;
  };
  components?: Record<string, string>;
  ports?: ServerPort[];
}

export interface Client {
  id: number;
  status?: ObjectStatus;
  username: string;
  language?: string;
  email?: string;
  notes?: string;
  id_hosting_plan?: number;
  created_at?: string;
  is_suspended?: boolean;
  suspend_on?: string | null;
  delete_on?: string | null;
  contact_data?: {
    first_name?: string;
    last_name?: string;
    company?: string;
  };
}

/** Body for POST /clients. */
export interface ClientCreate {
  username: string;
  email: string;
  /** Empty or left out: the server generates one and returns it. */
  password?: string;
  id_hosting_plan?: number;
  language?: string;
  notes?: string;
  send_login_credentials?: boolean;
  create_system_domain?: boolean;
  contact_data?: { first_name?: string; last_name?: string; company?: string };
}

/** Body for PUT /clients/{id}: only the fields the app edits. */
export interface ClientUpdate {
  email?: string;
  notes?: string;
  is_suspended?: boolean;
  contact_data?: { first_name?: string; last_name?: string; company?: string };
}

export interface ClientStatValue {
  value: number;
  /** -1 means unlimited. */
  max: number;
}

export type ClientStats = Partial<
  Record<
    | 'disk_space'
    | 'files'
    | 'traffic'
    | 'domains'
    | 'subdomains'
    | 'email_accounts'
    | 'email_addresses'
    | 'email_forwardings'
    | 'databases'
    | 'ftp_users'
    | 'scheduled_tasks',
    ClientStatValue
  >
>;

export interface HostingPlan {
  id: number;
  name: string;
}

export interface Domain {
  id: number;
  id_user: number;
  id_parent_domain?: number;
  status?: ObjectStatus;
  domain: string;
  domain_utf8?: string;
  created_at?: string;
  is_disabled?: boolean;
  is_subdomain?: boolean;
  is_system_domain?: boolean;
  is_email_domain?: boolean;
  target?: { target?: string; is_forwarding?: boolean };
  security?: {
    id_certificate?: number;
    lets_encrypt?: boolean;
    force_https?: boolean;
    is_hsts?: boolean;
  };
}

/** Body for POST /domains. */
export interface DomainCreate {
  id_user: number;
  domain: string;
  create_www_subdomain?: boolean;
  is_email_domain?: boolean;
  security?: { lets_encrypt?: boolean; force_https?: boolean };
}

export interface Certificate {
  id: number;
  id_user: number;
  name: string;
  secured_domains?: string[];
  valid_till?: string;
  issuer?: string;
}

export interface EmailAccount {
  id: number;
  id_user: number;
  id_domain?: number;
  status?: ObjectStatus;
  email: string;
  email_utf8?: string;
  description?: string;
  /** Bytes in use. */
  size?: number;
  /** Quota in bytes; 0 or -1 means unlimited. */
  max_size?: number;
  catch_all?: boolean;
  aliases?: string[];
  forwardings?: string[];
}

/** Body for POST /emails. */
export interface EmailCreate {
  id_user: number;
  email: string;
  /** Empty or left out: the server generates one and returns it. */
  password?: string;
  description?: string;
  max_size?: number;
}

export interface Database {
  id: number;
  id_user: number;
  database_name: string;
  database_username: string;
  description?: string;
  size?: number;
  remote_hosts?: string[];
}

/** Body for POST /databases. */
export interface DatabaseCreate {
  id_user: number;
  /** Left out: the server generates name and user name and returns them. */
  database_name?: string;
  database_username?: string;
  password?: string;
  description?: string;
}

export interface FtpUser {
  id: number;
  id_user: number;
  status?: ObjectStatus;
  username: string;
  description?: string;
  home_directory?: string;
}

export interface ScheduledTask {
  id: number;
  id_user: number;
  status?: ObjectStatus;
  type?: string;
  command?: string;
  description?: string;
  schedule?: {
    minute: string;
    hour: string;
    day_of_month: string;
    month: string;
    day_of_week: string;
  };
}

export interface BackupOperation {
  id_user?: number;
  id_repository?: number;
  /** For example "backup" or "restore". */
  type?: string;
  /** For example "processing", "finished" or "failed". */
  state?: string;
  progress?: number;
  messages?: string;
  description?: string;
  size_change?: number;
  started_at?: string;
  ended_at?: string | null;
}

/**
 * POST and PUT answer with the object's id. Values the server generated because the request left
 * them empty (a password, a database name) come back once in the same answer.
 */
export interface Created {
  id: number;
  password?: string;
  database_name?: string;
  database_username?: string;
}

/** The error body the API sends with 4xx answers. */
export interface ApiErrorBody {
  code: string;
  message: string;
}
