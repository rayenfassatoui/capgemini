---
description: Vercel AI SDK patterns for building AI-powered applications
triggers:
  - "features/**/ai/**"
  - "app/api/chat/**"
  - keywords: ["ai", "openai", "anthropic", "streaming", "chat", "completion"]
priority: 8
version: 1.0.0
last_updated: 2026-02-03
---

# Vercel AI SDK Patterns

## Overview

This skill provides guidance on using the Vercel AI SDK to build AI-powered features, including streaming responses, structured outputs, tool calling, and best practices for production applications.

## When to Use

- Building chat interfaces
- Streaming AI responses
- Using function/tool calling
- Implementing RAG (Retrieval-Augmented Generation)
- Structured data extraction with AI

---

## Installation

```bash
bun add ai
bun add openai @anthropic-ai/sdk # Choose your provider
```

---

## Core Patterns

### 1. Streaming Text Generation

**Route Handler**

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
    system: 'You are a helpful assistant for project management.',
    maxTokens: 1000,
    temperature: 0.7,
  });

  return result.toDataStreamResponse();
}
```

**Client Component**

```typescript
// features/chat/components/chat-interface.tsx
'use client';

import { useChat } from 'ai/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ChatInterface() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div className="flex h-screen flex-col">
      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xl rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-900'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-xl rounded-lg bg-gray-200 px-4 py-2">
              <div className="flex space-x-2">
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 delay-100" />
                <div className="h-2 w-2 animate-bounce rounded-full bg-gray-500 delay-200" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
```

---

## Advanced Patterns

### 2. Structured Output Generation

```typescript
// features/projects/ai/extract-project-data.ts
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const projectSchema = z.object({
  name: z.string().describe('The project name'),
  description: z.string().describe('A brief description'),
  priority: z.enum(['low', 'medium', 'high']),
  estimatedHours: z.number().describe('Estimated hours to complete'),
  tags: z.array(z.string()).describe('Relevant tags'),
});

export async function extractProjectData(input: string) {
  const { object } = await generateObject({
    model: openai('gpt-4-turbo'),
    schema: projectSchema,
    prompt: `Extract project information from the following input: ${input}`,
  });

  return object;
}
```

**Usage in Action**

```typescript
// features/projects/actions.ts
'use server';

import { extractProjectData } from './ai/extract-project-data';
import { createProject } from './services';

export async function createProjectFromAI(input: string) {
  const user = await getCurrentUser();
  
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Extract structured data using AI
    const projectData = await extractProjectData(input);
    
    // Create project in database
    const project = await createProject(projectData, user.id);
    
    return { success: true, project };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create project' 
    };
  }
}
```

---

### 3. Tool/Function Calling

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { getUserProjects, createProject } from '@/features/projects';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const user = await getCurrentUser();

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
    tools: {
      getProjects: tool({
        description: 'Get the user\'s projects',
        parameters: z.object({}),
        execute: async () => {
          if (!user) throw new Error('Unauthorized');
          const projects = await getUserProjects(user.id);
          return { projects };
        },
      }),
      
      createProject: tool({
        description: 'Create a new project',
        parameters: z.object({
          name: z.string().describe('The project name'),
          description: z.string().describe('Project description'),
        }),
        execute: async ({ name, description }) => {
          if (!user) throw new Error('Unauthorized');
          const project = await createProject({ name, description }, user.id);
          return { project };
        },
      }),
    },
    maxToolRoundtrips: 5,
  });

  return result.toDataStreamResponse();
}
```

**Client with Tool Calling**

```typescript
'use client';

import { useChat } from 'ai/react';
import { IconSparkles } from '@tabler/icons-react';

export function ProjectAssistant() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      <div className="space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            {/* Tool invocations */}
            {message.toolInvocations?.map((toolInvocation) => (
              <div key={toolInvocation.toolCallId} className="text-sm text-gray-600">
                {toolInvocation.state === 'call' && (
                  <div className="flex items-center gap-2">
                    <IconSparkles className="h-4 w-4" />
                    <span>Calling {toolInvocation.toolName}...</span>
                  </div>
                )}
                {toolInvocation.state === 'result' && (
                  <div>
                    <strong>{toolInvocation.toolName}:</strong>{' '}
                    {JSON.stringify(toolInvocation.result)}
                  </div>
                )}
              </div>
            ))}
            
            {/* Message content */}
            <div>{message.content}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

---

### 4. RAG (Retrieval-Augmented Generation)

```typescript
// features/chat/ai/rag-service.ts
import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db } from '@/lib/db';
import { documents } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function findRelevantDocuments(query: string, limit = 5) {
  // Generate embedding for query
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });

  // Search for similar documents using cosine similarity
  const results = await db
    .select()
    .from(documents)
    .orderBy(
      sql`1 - (${documents.embedding} <=> ${JSON.stringify(embedding)})`
    )
    .limit(limit);

  return results;
}

export async function indexDocuments(docs: { id: string; content: string }[]) {
  // Generate embeddings for multiple documents
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: docs.map((doc) => doc.content),
  });

  // Store in database
  await db.insert(documents).values(
    docs.map((doc, index) => ({
      id: doc.id,
      content: doc.content,
      embedding: embeddings[index],
    }))
  );
}
```

**RAG Chat Route**

```typescript
// app/api/chat/rag/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { findRelevantDocuments } from '@/features/chat/ai/rag-service';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1].content;

  // Find relevant documents
  const relevantDocs = await findRelevantDocuments(lastMessage);
  
  const context = relevantDocs
    .map((doc) => doc.content)
    .join('\n\n');

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
    system: `You are a helpful assistant. Use the following context to answer questions:
    
${context}

If the context doesn't contain relevant information, say so.`,
  });

  return result.toDataStreamResponse();
}
```

---

### 5. Multi-Modal (Vision)

```typescript
// app/api/vision/route.ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function POST(req: Request) {
  const { imageUrl, prompt } = await req.json();

  const { text } = await generateText({
    model: openai('gpt-4-vision-preview'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image: imageUrl },
        ],
      },
    ],
  });

  return Response.json({ text });
}
```

**Client Usage**

```typescript
'use client';

import { useState } from 'react';
import Image from 'next/image';

export function ImageAnalyzer() {
  const [imageUrl, setImageUrl] = useState('');
  const [result, setResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeImage = async () => {
    setIsAnalyzing(true);
    
    const response = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        prompt: 'Describe this image in detail',
      }),
    });
    
    const { text } = await response.json();
    setResult(text);
    setIsAnalyzing(false);
  };

  return (
    <div>
      <input
        type="url"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="Enter image URL"
      />
      <button onClick={analyzeImage} disabled={isAnalyzing}>
        {isAnalyzing ? 'Analyzing...' : 'Analyze'}
      </button>
      {result && <p>{result}</p>}
    </div>
  );
}
```

---

## Best Practices

### 1. Error Handling

```typescript
// ✅ GOOD: Comprehensive error handling
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const result = await streamText({
      model: openai('gpt-4-turbo'),
      messages,
      onError: (error) => {
        console.error('Streaming error:', error);
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error instanceof Error && error.message.includes('rate limit')) {
      return new Response('Rate limit exceeded. Please try again later.', {
        status: 429,
      });
    }
    
    return new Response('Internal server error', { status: 500 });
  }
}
```

### 2. Cost Optimization

```typescript
// ✅ GOOD: Token limit management
const result = await streamText({
  model: openai('gpt-4-turbo'),
  messages: messages.slice(-10), // Only last 10 messages
  maxTokens: 500, // Limit response length
  temperature: 0.7,
});

// ✅ GOOD: Use cheaper models for simple tasks
const shouldUseGPT4 = complexity === 'high';

const result = await streamText({
  model: shouldUseGPT4 
    ? openai('gpt-4-turbo') 
    : openai('gpt-3.5-turbo'),
  messages,
});
```

### 3. Caching Responses

```typescript
// ✅ GOOD: Cache repeated queries
import { unstable_cache } from 'next/cache';

const getCachedSummary = unstable_cache(
  async (text: string) => {
    const { text: summary } = await generateText({
      model: openai('gpt-4-turbo'),
      prompt: `Summarize: ${text}`,
    });
    return summary;
  },
  ['ai-summary'],
  { revalidate: 3600 } // Cache for 1 hour
);
```

### 4. Rate Limiting

```typescript
// ✅ GOOD: Implement rate limiting
import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

const ratelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const { success } = await ratelimit.limit(user.id);
  
  if (!success) {
    return new Response('Too many requests', { status: 429 });
  }
  
  // Process AI request
}
```

---

## Feature-Driven Integration

### Service Layer

```typescript
// features/chat/services.ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { db } from '@/lib/db';
import { conversations, messages } from '@/db/schema';

export async function createConversation(userId: string, title: string) {
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title })
    .returning();
  
  return conversation;
}

export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
) {
  const [message] = await db
    .insert(messages)
    .values({ conversationId, role, content })
    .returning();
  
  return message;
}

export async function generateAIResponse(
  conversationId: string,
  userMessage: string
) {
  // Save user message
  await addMessage(conversationId, 'user', userMessage);
  
  // Get conversation history
  const history = await db.query.messages.findMany({
    where: (messages, { eq }) => eq(messages.conversationId, conversationId),
    orderBy: (messages, { asc }) => [asc(messages.createdAt)],
  });
  
  // Generate AI response
  const { text } = await generateText({
    model: openai('gpt-4-turbo'),
    messages: history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  });
  
  // Save AI message
  await addMessage(conversationId, 'assistant', text);
  
  return text;
}
```

---

## Checklist

Before deploying AI features:

- [ ] API keys configured in environment variables
- [ ] Rate limiting implemented
- [ ] Error handling comprehensive
- [ ] Token limits set appropriately
- [ ] Cost optimization strategies applied
- [ ] User authentication enforced
- [ ] Streaming responses tested
- [ ] Tool calling validated
- [ ] Embeddings indexed (if using RAG)
- [ ] Edge runtime used where possible

---

## References

- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [OpenAI API Reference](https://platform.openai.com/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [AI SDK Examples](https://github.com/vercel/ai)

---

**Last Updated**: 2026-02-03  
**Version**: 1.0.0
