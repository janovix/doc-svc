-- Migration: 0001_initial_schema
-- Document Processing Service schema
-- NOTE: All column names use snake_case for consistency

-- Documents table - stores uploaded document metadata
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    original_file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    preview_keys TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_sha256_hash ON documents(sha256_hash);

-- Processing jobs table - stores processing results
CREATE TABLE IF NOT EXISTS processing_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    workflow_instance_id TEXT,
    
    -- Classification result
    doc_family TEXT,
    doc_type TEXT,
    classification_confidence REAL,
    classification_evidence TEXT,
    
    -- Visual validation result (MANDATORY)
    visual_validation_score REAL,
    visual_validation_threshold REAL,
    visual_validation_pass INTEGER,
    visual_validation_signals TEXT,
    visual_validation_evidence TEXT,
    
    -- Extraction result
    extracted_fields TEXT,
    
    -- Validations
    validations TEXT,
    
    -- Risk & Decision
    risk_score REAL,
    risk_signals TEXT,
    decision TEXT,
    decision_reason TEXT,
    
    -- Processing metadata
    markdown_key TEXT,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_document_id ON processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_organization_id ON processing_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
