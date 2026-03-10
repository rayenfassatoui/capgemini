import type { AgentToolDefinition, ToolHandler } from './types';

// ==================== CV POOL + SEARCH + DUPLICATE DETECTION ====================

export const definitions: AgentToolDefinition[] = [
  {
    name: 'upload_cv',
    description:
      'Upload a CV file that was attached by the user to this conversation. Provide the attachment index (0-based) from the attachments list. This will store the CV, parse it, and extract candidate data (name, email, skills, experience, etc). Use this when the user attaches a file and asks you to upload or process it.',
    parameters: {
      type: 'object',
      properties: {
        attachmentIndex: {
          type: 'string',
          description:
            'The 0-based index of the attachment from the ATTACHMENTS list in the system prompt',
        },
      },
      required: ['attachmentIndex'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'list_cv_pool',
    description:
      'List all CVs uploaded by the current user in the CV pool. Returns id, filename, extractedName, extractedEmail, extractedSkills, createdAt for each CV.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'get_cv_details',
    description:
      'Get full details of a specific CV by its ID, including extracted name, email, phone, skills, experiences, education, languages, and summary.',
    parameters: {
      type: 'object',
      properties: {
        cvId: { type: 'string', description: 'UUID of the CV to retrieve' },
      },
      required: ['cvId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'delete_cv',
    description: 'Delete a CV from the pool by its ID.',
    parameters: {
      type: 'object',
      properties: {
        cvId: { type: 'string', description: 'UUID of the CV to delete' },
      },
      required: ['cvId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: true,
  },
  {
    name: 'search_cv_pool',
    description:
      'Search and filter CVs in the pool by skills, languages, minimum experience positions, and/or location keyword. Returns matching CVs with extracted data.',
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          description:
            'Filter: only include CVs with at least one of these skills',
          items: { type: 'string' },
        },
        languages: {
          type: 'array',
          description:
            'Filter: only include CVs speaking at least one of these languages',
          items: { type: 'string' },
        },
        minExperience: {
          type: 'string',
          description:
            'Filter: minimum number of past positions/experiences (as number)',
        },
        location: {
          type: 'string',
          description:
            'Filter: keyword to search in CV text (city, country, region)',
        },
      },
      required: [],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'check_duplicate_cv',
    description:
      'Check if a specific CV has potential duplicates in the pool by comparing email, name similarity, and phone number.',
    parameters: {
      type: 'object',
      properties: {
        cvId: {
          type: 'string',
          description: 'UUID of the CV to check for duplicates',
        },
      },
      required: ['cvId'],
    },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
  {
    name: 'scan_pool_duplicates',
    description:
      'Scan the entire CV pool for duplicate entries. Returns groups of CVs that appear to be the same person based on email, name similarity, and phone number.',
    parameters: { type: 'object', properties: {}, required: [] },
    allowedRoles: ['ta', 'admin'],
    mutating: false,
  },
];

// ---- Executors ----

export const executors: Record<string, ToolHandler> = {
  upload_cv: async (args, { services, sanitizeForJson, ctx }) => {
    const attachment = args._attachment as
      | {
          filename: string;
          contentType: string;
          size: number;
          rawBytes: string;
        }
      | undefined;
    if (!attachment) {
      throw new Error(
        'No attachment data found at that index. Make sure the user attached a file.'
      );
    }

    const cv = await services.uploadCv(
      {
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        rawBytes: attachment.rawBytes,
      },
      ctx.userId
    );

    const rawText = await services.parseCvDocument(
      attachment.filename,
      attachment.contentType,
      attachment.rawBytes
    );

    const extraction = await services.extractCvDataWithAI(rawText);

    await services.updateCvExtraction(cv.id, {
      extractedName: extraction.extractedName,
      extractedEmail: extraction.extractedEmail,
      extractedPhone: extraction.extractedPhone,
      extractedSkills: extraction.extractedSkills,
      extractedExperiences: extraction.extractedExperiences,
      extractedEducation: extraction.extractedEducation,
      extractedLanguages: extraction.extractedLanguages,
      extractedSummary: extraction.extractedSummary,
    });
    await services.updateCvRawText(cv.id, rawText);

    // Generate and store semantic embedding (non-blocking — failure is logged, not thrown)
    const embeddingGenerated = await services.generateCvEmbeddingAfterUpload(cv.id);


    const { checkDuplicateCv } = await import('../duplicate-detection');
    const duplicates = await checkDuplicateCv(cv.id, ctx.userId);

    return {
      cvId: cv.id,
      filename: attachment.filename,
      extractedName: extraction.extractedName,
      extractedEmail: extraction.extractedEmail,
      extractedSkills: extraction.extractedSkills,
      extractedLanguages: extraction.extractedLanguages,
      extractedSummary: extraction.extractedSummary,
      embeddingGenerated,
      message: 'CV uploaded and parsed successfully',
      duplicateWarning:
        duplicates.length > 0
          ? `WARNING: ${duplicates.length} potential duplicate(s) found`
          : null,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
    };
  },

  list_cv_pool: async (_args, { services, sanitizeForJson, truncateArray, ctx }) => {
    const cvs = await services.listCvPool(ctx.userId);
    return truncateArray(
      cvs.map((cv) => sanitizeForJson(cv)),
      30
    );
  },

  get_cv_details: async (args, { services, resolveId, sanitizeForJson }) => {
    return sanitizeForJson(
      await services.getCvDetails(await resolveId(args.cvId, 'cvId'))
    );
  },

  delete_cv: async (args, { services, resolveId, ctx }) => {
    const cvId = await resolveId(args.cvId, 'cvId');
    await services.deleteCv(cvId, ctx.userId);
    return { deleted: true, cvId };
  },

  search_cv_pool: async (args, { services, sanitizeForJson, truncateArray, ctx }) => {
    const filtered = await services.searchCvPool(ctx.userId, {
      skills: (args.skills as string[]) ?? undefined,
      languages: (args.languages as string[]) ?? undefined,
      minExperience: args.minExperience
        ? Number(args.minExperience)
        : undefined,
      location: (args.location as string) ?? undefined,
    });
    return truncateArray(
      filtered.map((cv) => sanitizeForJson(cv)),
      30
    );
  },

  check_duplicate_cv: async (args, { resolveId, sanitizeForJson, ctx }) => {
    const cvId = await resolveId(args.cvId, 'cvId');
    const { checkDuplicateCv } = await import('../duplicate-detection');
    const duplicates = await checkDuplicateCv(cvId, ctx.userId);
    return duplicates.length > 0
      ? {
          found: true,
          count: duplicates.length,
          duplicates: sanitizeForJson(duplicates),
        }
      : { found: false, message: 'No duplicates found for this CV' };
  },

  scan_pool_duplicates: async (_args, { sanitizeForJson, ctx }) => {
    const { scanPoolForDuplicates } = await import('../duplicate-detection');
    const groups = await scanPoolForDuplicates(ctx.userId);
    return groups.length > 0
      ? {
          found: true,
          groupCount: groups.length,
          groups: sanitizeForJson(groups),
        }
      : { found: false, message: 'No duplicate CVs found in the pool' };
  },
};
