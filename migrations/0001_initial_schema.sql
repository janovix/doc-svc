-- Migration: 0001_initial_schema
-- Document Processing Service MVP schema
-- NOTE: All column names use snake_case for consistency
-- Clean all tables before running this migration

DROP TABLE IF EXISTS upload_links;
DROP TABLE IF EXISTS documents;


-- Upload links table - shareable links for document uploads
CREATE TABLE IF NOT EXISTS upload_links (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    max_uploads INTEGER,
    required_documents TEXT, -- JSON array of required document types
    uploaded_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', -- active, expired, completed
    allow_multiple_files INTEGER NOT NULL DEFAULT 1, -- boolean
    metadata TEXT, -- JSON object for client_id, notes, etc.
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_upload_links_organization_id ON upload_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_upload_links_status ON upload_links(status);
CREATE INDEX IF NOT EXISTS idx_upload_links_expires_at ON upload_links(expires_at);

-- Documents table - stores uploaded document metadata
-- Each document maintains a consistent file structure:
-- - original_pdfs: Original PDF files if uploaded
-- - original_images: Original image files if uploaded
-- - rasterized_images: Always present - rasterized JPEGs for viewing
-- - final_pdf_key: Always present - compiled PDF from rasterized images
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    organization_id TEXT NOT NULL,
    upload_link_id TEXT REFERENCES upload_links(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL, -- Total size of all files
    page_count INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL, -- Hash of final PDF
    -- File structure (R2 keys stored as JSON arrays/strings)
    original_pdfs TEXT, -- JSON array: ["documents/{orgId}/{docId}/originals/pdf_001.pdf", ...]
    original_images TEXT, -- JSON array: ["documents/{orgId}/{docId}/originals/img_001.jpg", ...]
    rasterized_images TEXT NOT NULL, -- JSON array: ["documents/{orgId}/{docId}/rasterized/page_001.jpg", ...] (always present)
    final_pdf_key TEXT NOT NULL, -- "documents/{orgId}/{docId}/final.pdf" (always present)
    -- Metadata
    document_type TEXT, -- Optional: mx_ine_front, mx_ine_back, proof_of_address, etc.
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_upload_link_id ON documents(upload_link_id);
CREATE INDEX IF NOT EXISTS idx_documents_sha256_hash ON documents(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
