-- =============================================
-- YZ ASİSTAN (RAG) TABLOLARI
-- =============================================

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36)     NOT NULL,
  title        VARCHAR(255)    DEFAULT 'Yeni Sohbet',
  created_at   DATETIME        DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS ai_chat_history (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      VARCHAR(36)     NOT NULL,
  session_id   INT             NOT NULL,
  message      TEXT            NOT NULL,
  response     TEXT,
  sources      JSON            DEFAULT NULL,
  created_at   DATETIME        DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  INDEX idx_session (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
