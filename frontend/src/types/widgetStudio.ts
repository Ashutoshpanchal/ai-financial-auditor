/** Widget Studio API types (``/widget-studio/*``). */

export type StudioWidgetType = "metric" | "bar" | "line" | "pie" | "multibar";

export interface WidgetStudioSession {
  id: string;
  title: string | null;
  created_at: string;
  widget_id: string | null;
  message_count: number;
}

export interface WidgetStudioMessage {
  id: string;
  role: string;
  content: string;
  agent_name: string | null;
  metadata: WidgetStudioMessageMetadata | null;
  created_at: string;
}

export interface WidgetStudioMessageMetadata {
  clarification?: boolean;
  chart_suggestions?: string[];
  clarification_checklist?: Record<string, boolean> | null;
  abstract_query?: string;
  resolved_intent?: Record<string, unknown>;
  error?: boolean;
  off_topic?: boolean;
}

export interface WidgetStudioPreviewData {
  rows?: Record<string, unknown>[];
  scalar?: number | null;
  row_count?: number;
}

export interface WidgetStudioPreview {
  type: StudioWidgetType;
  data: WidgetStudioPreviewData;
  chart_config?: Record<string, unknown>;
  abstract_query?: string;
  /** Stored SQL template with ``{{user_id}}`` / date placeholders. */
  resolved_query?: string;
  /** SQL actually executed (binds inlined) — set after Apply or super-admin message turn. */
  executed_query?: string;
  hardcoded_filters?: Record<string, string>;
  intent_text?: string;
}

export interface WidgetStudioSendResponse {
  reply: string;
  widget_preview: WidgetStudioPreview | null;
  chart_suggestions: string[];
  clarification_checklist: Record<string, boolean> | null;
  agent_logs?: AgentLogEntry[];
}

export interface AgentLogEntry {
  agent?: string;
  output?: unknown;
  duration_ms?: number;
}

export interface WidgetStudioLibraryItem {
  id: string;
  name: string;
  type: StudioWidgetType;
  created_at: string;
  broken: boolean;
}

export interface WidgetStudioRenderResponse {
  data?: WidgetStudioPreviewData;
  error?: string | null;
  message?: string | null;
  executed_query?: string | null;
  resolved_query_template?: string | null;
}

export interface MessageFiltersPayload {
  date_from?: string;
  date_to?: string;
  bank?: string;
  banks?: string[];
  parent_category?: string;
  sub_categories?: string[];
}
