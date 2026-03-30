BEGIN TRANSACTION;

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source TEXT,
  model_provider TEXT,
  cwd TEXT,
  tokens_used INTEGER,
  git_sha TEXT,
  git_branch TEXT,
  git_origin_url TEXT,
  cli_version TEXT,
  agent_nickname TEXT,
  agent_role TEXT,
  model TEXT,
  title TEXT,
  first_user_message TEXT
);

CREATE TABLE thread_spawn_edges (
  parent_thread_id TEXT NOT NULL,
  child_thread_id TEXT NOT NULL
);

INSERT INTO threads (
  id,
  created_at,
  updated_at,
  source,
  model_provider,
  cwd,
  tokens_used,
  git_sha,
  git_branch,
  git_origin_url,
  cli_version,
  agent_nickname,
  agent_role,
  model,
  title,
  first_user_message
) VALUES
  (
    'thread-root',
    '2026-03-01T12:00:00Z',
    '2026-03-01T12:30:00Z',
    'interactive',
    'openai',
    '/repo/main',
    1200,
    'abc1234',
    'main',
    'git@github.com:OpenAI/Agent-Badge.git',
    '0.1.0',
    'maintainer',
    'primary',
    'gpt-5.2',
    'Root title',
    'Summarize the repo status'
  ),
  (
    'thread-no-origin',
    '2026-03-02T08:00:00Z',
    '2026-03-02T08:20:00Z',
    'interactive',
    'openai',
    '/repo/no-origin',
    220,
    'def5678',
    'feature/no-origin',
    NULL,
    '0.1.0',
    'maintainer',
    'primary',
    'gpt-5.2-mini',
    'No origin title',
    'Inspect local changes'
  ),
  (
    'thread-parent',
    '2026-03-03T09:00:00Z',
    '2026-03-03T09:25:00Z',
    'interactive',
    'openai',
    '/repo/main',
    900,
    'aaa1111',
    'main',
    'https://github.com/openai/agent-badge.git',
    '0.1.0',
    'planner',
    'primary',
    'gpt-5.2',
    'Parent title',
    'Plan the adapter'
  ),
  (
    'thread-child',
    '2026-03-03T09:05:00Z',
    '2026-03-03T09:18:00Z',
    'spawned',
    'openai',
    '/repo/main',
    300,
    'bbb2222',
    'main',
    'https://github.com/openai/agent-badge.git',
    '0.1.0',
    'coder',
    'subagent',
    'gpt-5.2-mini',
    'Child title',
    'Implement the adapter'
  );

INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id) VALUES
  ('thread-parent', 'thread-child');

COMMIT;
