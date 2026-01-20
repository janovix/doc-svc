/**
 * Documents Router
 * Sub-router for document endpoints
 */

import { Hono } from "hono";
import { fromHono } from "chanfana";
import { DocumentUpload } from "./upload";
import { DocumentRead } from "./read";
import { DocumentList } from "./list";

export const documentsRouter = fromHono(new Hono());

documentsRouter.get("/", DocumentList);
documentsRouter.post("/upload", DocumentUpload);
documentsRouter.get("/:id", DocumentRead);
