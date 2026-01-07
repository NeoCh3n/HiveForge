export type AgentId =
  | "orchestrator"
  | "planner"
  | "implementer"
  | "reviewer"
  | "integrator"
  | string;

export type MessageType =
  | "ISSUE"
  | "PLAN_REQUEST"
  | "PLAN"
  | "TASK_REQUEST"
  | "RESULT"
  | "REVIEW_REQUEST"
  | "REVIEW"
  | "MERGE_REQUEST"
  | "MERGE_CONFIRMED"
  | "INFO";

export interface ContextRef {
  kind: string;
  id?: string;
  path?: string;
  note?: string;
}

export interface Message {
  thread_id: string;
  msg_id: string;
  from: AgentId;
  to: AgentId;
  type: MessageType;
  priority?: "low" | "normal" | "high";
  context_refs?: ContextRef[];
  acceptance_criteria?: string[];
  payload: Record<string, any>;
  created_at: string;
}

export type WorkflowStateValue =
  | "ISSUE_RECEIVED"
  | "PLAN_REQUESTED"
  | "PLAN_RECEIVED"
  | "TASK_DISPATCHED"
  | "RESULT_RECEIVED"
  | "REVIEW_REQUESTED"
  | "REVIEW_RECEIVED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_RECEIVED"
  | "MERGE_REQUESTED"
  | "DONE"
  | "ITERATING"
  | "ERROR";

export interface WorkflowState {
  thread_id: string;
  state: WorkflowStateValue;
  updated_at: string;
  history: string[];
  issue?: any;
  plan?: any;
  result?: any;
  review?: any;
  data?: Record<string, any>;
}

export type BeadType = "ProjectBead" | "DecisionBead" | "TaskBead";

export interface Bead {
  id: string;
  type: BeadType;
  title: string;
  content: string;
  thread_id?: string;
  tags?: string[];
  created_at: string;
  extra?: Record<string, any>;
}
