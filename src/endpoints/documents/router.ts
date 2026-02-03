/**
 * Documents Router
 * Sub-router for document endpoints
 */

import { Hono } from "hono";
import { fromHono } from "chanfana";
import { DocumentRead } from "./read";
import { DocumentList } from "./list";
import { InitiateUpload } from "./initiate-upload";
import { InitiateUploadPublic } from "./initiate-upload-public";
import { ConfirmUpload } from "./confirm-upload";
import { GetDocumentUrls } from "./get-urls";
import type { Bindings } from "../../types";

export const documentsRouter = fromHono(new Hono<{ Bindings: Bindings }>());

// List and basic CRUD
documentsRouter.get("/", DocumentList);
documentsRouter.get("/:id", DocumentRead);

// Presigned URL upload flow (authenticated)
documentsRouter.post("/initiate-upload", InitiateUpload);

// Presigned URL upload flow (public with Turnstile)
documentsRouter.post("/initiate-upload/public", InitiateUploadPublic);

// Common endpoints (support both auth and session token)
documentsRouter.post("/:id/confirm", ConfirmUpload);
documentsRouter.get("/:id/urls", GetDocumentUrls);
