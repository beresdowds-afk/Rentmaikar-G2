/**
 * EMQX MQTT Broker Configuration
 * 
 * Provides EMQX-specific settings for the RentMaiKar IoT fleet,
 * including shared subscriptions, ACL patterns, $SYS monitoring,
 * and HTTP Management API integration.
 */

// ── EMQX Broker Connection Profiles ───────────────────────

export interface EMQXBrokerProfile {
  name: string;
  description: string;
  /** WebSocket URL for browser clients */
  wsUrl: string;
  /** TCP URL for device clients */
  tcpUrl: string;
  /** TLS WebSocket URL */
  wssUrl: string;
  /** TLS TCP URL */
  sslUrl: string;
  /** EMQX Dashboard / HTTP API base URL */
  apiUrl: string;
  /** API version */
  apiVersion: 'v5';
}

export const EMQX_PROFILES: Record<string, EMQXBrokerProfile> = {
  production: {
    name: 'Production',
    description: 'EMQX Cloud production cluster',
    wsUrl: 'ws://broker.rentmaikar.com:8083/mqtt',
    tcpUrl: 'mqtt://broker.rentmaikar.com:1883',
    wssUrl: 'wss://broker.rentmaikar.com:8084/mqtt',
    sslUrl: 'mqtts://broker.rentmaikar.com:8883',
    apiUrl: 'https://broker.rentmaikar.com:8443/api/v5',
    apiVersion: 'v5',
  },
  staging: {
    name: 'Staging',
    description: 'EMQX staging environment',
    wsUrl: 'ws://staging-broker.rentmaikar.com:8083/mqtt',
    tcpUrl: 'mqtt://staging-broker.rentmaikar.com:1883',
    wssUrl: 'wss://staging-broker.rentmaikar.com:8084/mqtt',
    sslUrl: 'mqtts://staging-broker.rentmaikar.com:8883',
    apiUrl: 'https://staging-broker.rentmaikar.com:8443/api/v5',
    apiVersion: 'v5',
  },
  local: {
    name: 'Local Dev',
    description: 'Local EMQX instance for development',
    wsUrl: 'ws://localhost:8083/mqtt',
    tcpUrl: 'mqtt://localhost:1883',
    wssUrl: 'wss://localhost:8084/mqtt',
    sslUrl: 'mqtts://localhost:8883',
    apiUrl: 'http://localhost:18083/api/v5',
    apiVersion: 'v5',
  },
};

// ── EMQX Client Configuration ─────────────────────────────

export interface EMQXClientConfig {
  /** WebSocket URL (browser) */
  brokerUrl: string;
  /** Client ID prefix */
  clientIdPrefix: string;
  /** MQTT v5 protocol */
  protocolVersion: 5;
  /** Clean start = false for persistent sessions */
  clean: false;
  /** Session expiry (seconds) */
  sessionExpiryInterval: number;
  /** Keep-alive interval (seconds) */
  keepalive: number;
  /** Receive maximum (MQTT v5 flow control) */
  receiveMaximum: number;
  /** Maximum packet size (bytes) */
  maximumPacketSize: number;
  /** Topic alias maximum (EMQX optimization) */
  topicAliasMaximum: number;
  /** Request/response correlation (MQTT v5) */
  requestResponseInformation: boolean;
}

export function getEMQXClientConfig(profile: keyof typeof EMQX_PROFILES = 'production'): EMQXClientConfig {
  return {
    brokerUrl: EMQX_PROFILES[profile].wssUrl,
    clientIdPrefix: 'rmk_fleet_',
    protocolVersion: 5,
    clean: false,
    sessionExpiryInterval: 86400, // 24 hours
    keepalive: 60,
    receiveMaximum: 1000,
    maximumPacketSize: 1048576, // 1MB
    topicAliasMaximum: 65535,
    requestResponseInformation: true,
  };
}

// ── EMQX Shared Subscriptions ─────────────────────────────
// $share/{group}/{topic} — load-balanced across group members

export const EMQX_SHARED_SUBSCRIPTIONS = {
  /** Fleet monitoring group — all admin/dashboard clients share the load */
  FLEET_MONITOR: {
    group: 'fleet-monitor',
    topics: [
      '$share/fleet-monitor/rentmaikar/vehicles/+/telemetry/gps',
      '$share/fleet-monitor/rentmaikar/vehicles/+/telemetry/engine',
      '$share/fleet-monitor/rentmaikar/vehicles/+/telemetry/diagnostics',
      '$share/fleet-monitor/rentmaikar/vehicles/+/telemetry/batch',
      '$share/fleet-monitor/rentmaikar/vehicles/+/status',
    ],
  },
  /** Accident responder group — ensures exactly one responder picks up each event */
  ACCIDENT_RESPONDER: {
    group: 'accident-responder',
    topics: [
      '$share/accident-responder/rentmaikar/vehicles/+/accident/raw/#',
      '$share/accident-responder/rentmaikar/vehicles/+/accident/verified/#',
    ],
  },
  /** Command processor group — distributes command acknowledgements */
  COMMAND_PROCESSOR: {
    group: 'cmd-processor',
    topics: [
      '$share/cmd-processor/rentmaikar/vehicles/+/commands',
    ],
  },
} as const;

// ── EMQX $SYS Topics for Broker Monitoring ────────────────

export const EMQX_SYS_TOPICS = {
  /** Broker uptime */
  UPTIME: '$SYS/brokers/+/uptime',
  /** Current connected clients */
  CLIENTS_CONNECTED: '$SYS/brokers/+/stats/connections.count',
  /** Total subscriptions */
  SUBSCRIPTIONS_COUNT: '$SYS/brokers/+/stats/subscriptions.count',
  /** Messages received per second */
  MESSAGES_RECEIVED: '$SYS/brokers/+/stats/messages.received',
  /** Messages sent per second */
  MESSAGES_SENT: '$SYS/brokers/+/stats/messages.sent',
  /** Messages dropped */
  MESSAGES_DROPPED: '$SYS/brokers/+/stats/messages.dropped',
  /** Retained messages */
  RETAINED_COUNT: '$SYS/brokers/+/stats/retained.count',
  /** Topics count */
  TOPICS_COUNT: '$SYS/brokers/+/stats/topics.count',
  /** Bytes received */
  BYTES_RECEIVED: '$SYS/brokers/+/metrics/bytes.received',
  /** Bytes sent */
  BYTES_SENT: '$SYS/brokers/+/metrics/bytes.sent',
} as const;

// ── EMQX ACL Rule Patterns ────────────────────────────────

export interface EMQXACLRule {
  /** Action: publish or subscribe */
  action: 'publish' | 'subscribe' | 'all';
  /** Permission: allow or deny */
  permission: 'allow' | 'deny';
  /** Topic pattern with EMQX placeholders: %u = username, %c = clientid */
  topic: string;
  /** Description */
  description: string;
}

export const EMQX_ACL_RULES: EMQXACLRule[] = [
  // Vehicle device ACLs
  {
    action: 'publish',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/%u/telemetry/#',
    description: 'Vehicle can publish its own telemetry',
  },
  {
    action: 'publish',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/%u/accident/#',
    description: 'Vehicle can publish its own accident data',
  },
  {
    action: 'publish',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/%u/status',
    description: 'Vehicle can publish its own status',
  },
  {
    action: 'subscribe',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/%u/commands',
    description: 'Vehicle can subscribe to its own commands',
  },
  {
    action: 'subscribe',
    permission: 'deny',
    topic: 'rentmaikar/vehicles/+/telemetry/#',
    description: 'Vehicle cannot subscribe to other vehicles telemetry',
  },
  // Admin/Fleet manager ACLs
  {
    action: 'subscribe',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/+/telemetry/#',
    description: 'Fleet manager can subscribe to all vehicle telemetry',
  },
  {
    action: 'subscribe',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/+/accident/#',
    description: 'Fleet manager can subscribe to all accident events',
  },
  {
    action: 'publish',
    permission: 'allow',
    topic: 'rentmaikar/vehicles/+/commands',
    description: 'Fleet manager can publish commands to any vehicle',
  },
  {
    action: 'subscribe',
    permission: 'allow',
    topic: '$SYS/#',
    description: 'Fleet manager can subscribe to $SYS monitoring topics',
  },
];

// ── EMQX Authentication Config ────────────────────────────

export interface EMQXAuthConfig {
  /** Authentication backend type */
  mechanism: 'jwt' | 'password_based' | 'enhanced_authentication';
  /** JWT settings (preferred for IoT devices) */
  jwt: {
    /** Use from: password field of CONNECT packet */
    from: 'password';
    /** HMAC-SHA256 signing */
    algorithm: 'hmac-based';
    secret_base64_encoded: boolean;
    /** Verify claims */
    verify_claims: {
      /** Match username to MQTT username */
      username: '%u';
    };
    /** Token expiry enforcement */
    disconnect_after_expire: boolean;
  };
  /** Password-based fallback for admin dashboard clients */
  password: {
    backend: 'built_in_database';
    mechanism: 'password_based';
    password_hash_algorithm: {
      name: 'bcrypt';
      salt_rounds: 10;
    };
  };
}

export const EMQX_AUTH_CONFIG: EMQXAuthConfig = {
  mechanism: 'jwt',
  jwt: {
    from: 'password',
    algorithm: 'hmac-based',
    secret_base64_encoded: false,
    verify_claims: {
      username: '%u',
    },
    disconnect_after_expire: true,
  },
  password: {
    backend: 'built_in_database',
    mechanism: 'password_based',
    password_hash_algorithm: {
      name: 'bcrypt',
      salt_rounds: 10,
    },
  },
};

// ── EMQX Rule Engine Integration ──────────────────────────
// Rules for server-side processing (configured via EMQX Dashboard or API)

export interface EMQXRule {
  id: string;
  name: string;
  sql: string;
  actions: { type: string; config: Record<string, any> }[];
  description: string;
  enabled: boolean;
}

export const EMQX_RULES: EMQXRule[] = [
  {
    id: 'gps_to_postgres',
    name: 'GPS → Database',
    sql: `SELECT
      payload.vehicleId as vehicle_id,
      payload.lat as latitude,
      payload.lng as longitude,
      payload.speed as speed,
      payload.heading as heading,
      payload.battery as battery_level,
      now_timestamp() as received_at
    FROM "rentmaikar/vehicles/+/telemetry/gps"`,
    actions: [
      {
        type: 'postgresql',
        config: {
          table: 'mqtt_telemetry_logs',
          sql_type: 'insert',
        },
      },
    ],
    description: 'Store GPS data directly to PostgreSQL via EMQX rule engine',
    enabled: true,
  },
  {
    id: 'accident_webhook',
    name: 'Accident → Webhook',
    sql: `SELECT
      payload.vehicleId as vehicle_id,
      payload.totalG as total_g,
      payload.triggerType as trigger_type,
      payload.latitude as latitude,
      payload.longitude as longitude,
      payload
    FROM "rentmaikar/vehicles/+/accident/raw/#"
    WHERE payload.totalG >= 5`,
    actions: [
      {
        type: 'webhook',
        config: {
          url: '${SUPABASE_URL}/functions/v1/iot-accident-detection',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      },
    ],
    description: 'Forward raw accident events (≥5G) to backend for processing',
    enabled: true,
  },
  {
    id: 'offline_detection',
    name: 'Offline Detection',
    sql: `SELECT
      *
    FROM "$events/client_disconnected"
    WHERE str(clientid) =~ 'rmk_vehicle_'`,
    actions: [
      {
        type: 'webhook',
        config: {
          url: '${SUPABASE_URL}/functions/v1/telemetry-health-monitor',
          method: 'POST',
          body: '{"event":"disconnect","clientId":"${clientid}","reason":"${reason}"}',
        },
      },
    ],
    description: 'Detect vehicle device disconnections via EMQX event system',
    enabled: true,
  },
  {
    id: 'message_transformation',
    name: 'Republish Alerts',
    sql: `SELECT
      payload,
      topic
    FROM "rentmaikar/vehicles/+/telemetry/engine"
    WHERE payload.engine_temp > 230`,
    actions: [
      {
        type: 'republish',
        config: {
          topic: 'rentmaikar/alerts/overheating/${vehicle_id}',
          qos: 1,
          retain: false,
        },
      },
    ],
    description: 'Republish overheating alerts to dedicated alert topic',
    enabled: true,
  },
];

// ── EMQX HTTP API Response Types ──────────────────────────

export interface EMQXClusterStats {
  nodes: {
    node: string;
    status: 'running' | 'stopped';
    uptime: string;
    version: string;
    connections: number;
    subscriptions: number;
    topics: number;
    retained: number;
    load1: string;
    load5: string;
    load15: string;
    max_fds: number;
    memory_total: string;
    memory_used: string;
  }[];
  stats: {
    connections_count: number;
    connections_max: number;
    subscriptions_count: number;
    subscriptions_max: number;
    topics_count: number;
    topics_max: number;
    retained_count: number;
    retained_max: number;
  };
  metrics: {
    messages_received: number;
    messages_sent: number;
    messages_dropped: number;
    messages_publish: number;
    bytes_received: number;
    bytes_sent: number;
    packets_connect: number;
    packets_disconnect: number;
    packets_subscribe: number;
    packets_unsubscribe: number;
    delivery_dropped: number;
  };
}

export interface EMQXClientInfo {
  clientid: string;
  username: string;
  node: string;
  ip_address: string;
  port: number;
  connected: boolean;
  connected_at: string;
  keepalive: number;
  clean_start: boolean;
  proto_ver: number;
  subscriptions_count: number;
  inflight_count: number;
  mqueue_len: number;
  recv_msg: number;
  send_msg: number;
  recv_oct: number;
  send_oct: number;
}

export interface EMQXSubscription {
  clientid: string;
  topic: string;
  qos: number;
  node: string;
}

// ── EMQX Bridge Configuration (for Supabase PostgreSQL) ───

export interface EMQXBridgeConfig {
  type: 'postgresql';
  name: string;
  server: string;
  database: string;
  username: string;
  password: string; // sourced from secrets
  pool_size: number;
  ssl: { enable: boolean };
  resource_opts: {
    batch_size: number;
    batch_time: string;
    buffer_mode: 'memory' | 'disk' | 'volatile_offload';
    health_check_interval: string;
  };
}

export const EMQX_POSTGRES_BRIDGE: Omit<EMQXBridgeConfig, 'server' | 'password'> = {
  type: 'postgresql',
  name: 'rentmaikar_telemetry_bridge',
  database: 'postgres',
  username: 'postgres',
  pool_size: 8,
  ssl: { enable: true },
  resource_opts: {
    batch_size: 100,
    batch_time: '10ms',
    buffer_mode: 'memory',
    health_check_interval: '15s',
  },
};

// ── EMQX Topic Metrics Config ─────────────────────────────

export const EMQX_MONITORED_TOPICS = [
  'rentmaikar/vehicles/+/telemetry/gps',
  'rentmaikar/vehicles/+/telemetry/engine',
  'rentmaikar/vehicles/+/telemetry/diagnostics',
  'rentmaikar/vehicles/+/accident/raw/#',
  'rentmaikar/vehicles/+/accident/verified/#',
  'rentmaikar/vehicles/+/commands',
  'rentmaikar/vehicles/+/status',
];

// ── Recommended MQTT Ports ─────────────────────────────────

export const EMQX_RECOMMENDED_PORTS = [
  { port: 8883, protocol: 'MQTTS', tls: true, description: 'MQTT over TLS/SSL — device connections' },
  { port: 8084, protocol: 'WSS', tls: true, description: 'WebSocket over TLS/SSL — browser connections' },
] as const;

// ── Tiered Data Retention Strategy ────────────────────────

export interface DataRetentionTier {
  name: string;
  label: string;
  retentionDays: number | null; // null = indefinite
  description: string;
  tables: string[];
  resolution: string;
  storageEstimate: string;
  autoCleanup: boolean;
}

export const DATA_RETENTION_TIERS: DataRetentionTier[] = [
  {
    name: 'realtime',
    label: 'Real-Time',
    retentionDays: null,
    description: 'Live telemetry streamed to dashboard via MQTT subscriptions. Not persisted beyond active session.',
    tables: [],
    resolution: 'Full (30s GPS moving, 15m engine)',
    storageEstimate: 'In-memory only',
    autoCleanup: false,
  },
  {
    name: 'recent',
    label: 'Recent (7 days)',
    retentionDays: 7,
    description: 'High-resolution telemetry kept for debugging, replay, and operational review.',
    tables: ['mqtt_telemetry_logs'],
    resolution: 'Full resolution — every data point retained',
    storageEstimate: '~50 MB per 100 vehicles/day',
    autoCleanup: true,
  },
  {
    name: 'historical',
    label: 'Historical (30+ days)',
    retentionDays: 30,
    description: 'Down-sampled summaries and critical events archived for compliance and analytics.',
    tables: ['driver_behavior_logs', 'iot_devices'],
    resolution: 'Hourly averages for GPS/engine; all accident & alert events preserved',
    storageEstimate: '~5 MB per 100 vehicles/day',
    autoCleanup: true,
  },
  {
    name: 'permanent',
    label: 'Permanent Archive',
    retentionDays: null,
    description: 'Accident records, critical incidents, and audit trails stored indefinitely for legal/insurance.',
    tables: ['driver_behavior_logs (severity=critical)', 'device_activity_log'],
    resolution: 'Full detail for critical events only',
    storageEstimate: 'Minimal (~1 MB/month fleet-wide)',
    autoCleanup: false,
  },
];

export const RETENTION_CLEANUP_RULES = {
  /** Delete mqtt_telemetry_logs older than 7 days */
  telemetryPurgeDays: 7,
  /** Down-sample GPS to hourly averages after 7 days */
  gpsSampleAfterDays: 7,
  /** Keep driver_behavior_logs >= warning for 30 days, info for 7 days */
  behaviorInfoPurgeDays: 7,
  behaviorWarningPurgeDays: 30,
  /** Never delete critical/accident events */
  criticalEventPurge: false,
  /** Run cleanup daily at 3:00 AM */
  cleanupCronSchedule: '0 3 * * *',
};

// ── Helper: Build EMQX MQTT.js options ────────────────────

export function buildEMQXConnectOptions(
  profile: keyof typeof EMQX_PROFILES = 'production',
  clientIdSuffix?: string,
) {
  const config = getEMQXClientConfig(profile);
  const clientId = `${config.clientIdPrefix}${clientIdSuffix || Math.random().toString(16).slice(2, 10)}`;

  return {
    brokerUrl: config.brokerUrl,
    options: {
      clientId,
      protocolVersion: config.protocolVersion,
      clean: config.clean,
      connectTimeout: 30000,
      reconnectPeriod: 5000,
      keepalive: config.keepalive,
      properties: {
        sessionExpiryInterval: config.sessionExpiryInterval,
        receiveMaximum: config.receiveMaximum,
        maximumPacketSize: config.maximumPacketSize,
        topicAliasMaximum: config.topicAliasMaximum,
        requestResponseInformation: config.requestResponseInformation,
      },
    },
  };
}
